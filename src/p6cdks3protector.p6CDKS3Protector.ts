import type { GetBucketAclOutput, Grant } from '@aws-sdk/client-s3'
import type { Context } from 'aws-lambda'
import type { Logger } from 'winston'
import fs from 'node:fs'
import path from 'node:path'
import { S3 } from '@aws-sdk/client-s3'
import { PutPublicAccessBlockCommand, S3ControlClient } from '@aws-sdk/client-s3-control'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import winston from 'winston'

// Configure the logger
const logger: Logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console(),
  ],
})

const s3Client = new S3({})
const s3ControlClient = new S3ControlClient({})
const stsClient = new STSClient({})

interface S3Event {
  detail: {
    requestParameters: {
      [key: string]: any
    }
    eventName: string
    errorCode?: string
    errorMessage?: string
  }
}

function p6ShortCircuitShould(event: S3Event): boolean {
  if (event.detail.requestParameters['x-amz-acl']) {
    logger.info('ACL is currently %s', event.detail.requestParameters['x-amz-acl'][0])
    if (event.detail.requestParameters['x-amz-acl'][0] === 'private') {
      logger.info('ACL is already private.  Ending.')
      return true
    }
  }
  return false
}

function p6LoopPrevent(event: S3Event): boolean {
  if (event.detail.errorCode || event.detail.errorMessage) {
    logger.info('Previous API call resulted in an error. Ending')
    return true
  }
  return false
}

async function p6S3BucketAclGet(event: S3Event): Promise<GetBucketAclOutput | false> {
  try {
    const bucketName = event.detail.requestParameters.bucketName
    logger.info('Describing the current ACL: s3://%s', bucketName)
    const bucketAcl = await s3Client.getBucketAcl({ Bucket: bucketName })
    logger.info(JSON.stringify(bucketAcl))
    return bucketAcl
  }
  catch (err) {
    logger.error('Error was: {%s} Manual followup recommended', err)
    return false
  }
}

function p6LogDeliveryPreserve(bucketAcl: GetBucketAclOutput): [string, Grant[]] {
  let uriList = ''
  const preserveLogDelivery: Grant[] = []

  for (const grant of bucketAcl.Grants || []) {
    if (grant.Grantee?.URI) {
      logger.info('Found Grant: %s', JSON.stringify(grant))
      uriList += grant.Grantee.URI
      if (grant.Grantee.URI.includes('LogDelivery')) {
        preserveLogDelivery.push(grant)
      }
    }
  }

  return [uriList, preserveLogDelivery]
}

function p6S3BucketAclViolation(uriList: string): boolean {
  if (uriList.includes('AllUsers') || uriList.includes('AuthenticatedUsers')) {
    logger.info('Violation found.  Grant ACL greater than Private')
    return true
  }
  logger.info('ACL is correctly already private')
  return false
}

async function p6S3BucketAclCorrect(bucketAcl: GetBucketAclOutput, preserveLogDelivery: Array<Grant> | false): Promise<void> {
  logger.info('Attempting Automatic Resolution')
  try {
    if (preserveLogDelivery) {
      logger.info('ACL resetting ACL to LogDelivery')
      logger.info('Preserve was: %s', JSON.stringify(preserveLogDelivery))

      const aclString = {
        Grants: preserveLogDelivery,
        Owner: bucketAcl.Owner,
      }

      const response = await s3Client.putBucketAcl({
        Bucket: bucketAcl?.Owner?.ID,
        AccessControlPolicy: aclString,
      })

      logger.info(JSON.stringify(response))
      if (response.$metadata.httpStatusCode === 200) {
        logger.info('Reverted to only contain LogDelivery')
      }
      else {
        logger.error('PutBucketACL failed. Manual followup')
      }
    }
    else {
      logger.info('ACL resetting ACL to Private')
      const response = await s3Client.putBucketAcl({
        Bucket: bucketAcl?.Owner?.ID,
        ACL: 'private',
      })

      logger.info(JSON.stringify(response))
      if (response.$metadata.httpStatusCode === 200) {
        logger.info('Bucket ACL has been changed to Private')
      }
      else {
        logger.error('PutBucketACL failed. Manual followup')
      }
    }
  }
  catch (err) {
    logger.info('Unable to resolve violation automatically')
    logger.info('Error was: %s', err)
  }
}

async function p6S3PublicBucketAcl(event: S3Event): Promise<boolean> {
  if (p6ShortCircuitShould(event)) {
    return true
  }

  if (p6LoopPrevent(event)) {
    return true
  }

  const bucketAcl = await p6S3BucketAclGet(event)
  if (!bucketAcl) {
    return false
  }

  const [uriList, preserveLogDelivery] = p6LogDeliveryPreserve(bucketAcl)

  if (p6S3BucketAclViolation(uriList)) {
    await p6S3BucketAclCorrect(bucketAcl, preserveLogDelivery)
    return true
  }

  return false
}

async function awsIsPrivate(bucket: string, key: string): Promise<boolean> {
  logger.info('Describing the ACL: s3://%s/%s', bucket, key)
  const acl = await s3Client.getObjectAcl({ Bucket: bucket, Key: key })

  if (acl.Grants!.length > 1) {
    logger.info('Greater than one Grant')
    return false
  }

  const ownerId = acl.Owner?.ID
  const granteeId = acl.Grants![0].Grantee?.ID
  if (ownerId !== granteeId) {
    logger.info('owner:[%s], grantee[%s] do not match', ownerId, granteeId)
    return false
  }

  return true
}

async function awsMakePrivate(bucket: string, key: string): Promise<void> {
  logger.info('Making s3://%s/%s private', bucket, key)
  await s3Client.putObjectAcl({ Bucket: bucket, Key: key, ACL: 'private' })
}

async function p6S3PublicBucketObjectAcl(event: S3Event): Promise<void> {
  const key = event.detail.requestParameters.key
  const bucket = event.detail.requestParameters.bucketName

  if (!(await awsIsPrivate(bucket, key))) {
    await awsMakePrivate(bucket, key)
  }
}

async function p6S3PublicBucketAccessBlock(event: S3Event): Promise<void> {
  const pbc = event.detail.requestParameters.PublicAccessBlockConfiguration
  logger.info(JSON.stringify(pbc))

  if (!pbc.RestrictPublicBuckets || !pbc.BlockPublicPolicy || !pbc.BlockPublicAcls || !pbc.IgnorePublicAcls) {
    const bucket = event.detail.requestParameters.bucketName
    logger.info('s3://%s now not private, fixing...', bucket)

    const response = await s3Client.putPublicAccessBlock({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    })

    logger.info(JSON.stringify(response))
  }
}

async function p6S3PublicAccessBlock(event: S3Event): Promise<void> {
  const pbc = event.detail.requestParameters.PublicAccessBlockConfiguration
  logger.info(JSON.stringify(pbc))

  if (!pbc.RestrictPublicBuckets || !pbc.BlockPublicPolicy || !pbc.BlockPublicAcls || !pbc.IgnorePublicAcls) {
    const command = new GetCallerIdentityCommand({})
    const account = await stsClient.send(command)
    logger.info('%s', account)

    const response = await s3ControlClient.send(new PutPublicAccessBlockCommand({
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
      AccountId: account.Account,
    }))

    logger.info(JSON.stringify(response))
  }
}

async function p6S3PublicFusebox(event: S3Event): Promise<boolean> {
  if (!event.detail || !event.detail.eventName) {
    return false
  }

  const events = [
    'PutBucketAcl',
    'PutObjectAcl',
    'PutBucketPublicAccessBlock',
    'PutAccountPublicAccessBlock',
  ]

  const eventName = event.detail.eventName
  if (events.includes(eventName)) {
    logger.info('======================================================================================')
    logger.info('eventName: %s', eventName)
  }

  if (eventName === 'PutBucketAcl') {
    await p6S3PublicBucketAcl(event)
  }
  else if (eventName === 'PutObjectAcl') {
    await p6S3PublicBucketObjectAcl(event)
  }
  else if (eventName === 'PutBucketPublicAccessBlock') {
    await p6S3PublicBucketAccessBlock(event)
  }
  else if (eventName === 'PutAccountPublicAccessBlock') {
    await p6S3PublicAccessBlock(event)
  }

  return true
}

export async function handler(event: S3Event, _context?: Context): Promise<boolean> {
  await p6S3PublicFusebox(event)
  return true
}

export async function main(): Promise<void> {
  logger.debug('Reading fixtures/putBucketAcl.json')
  const data = JSON.parse(fs.readFileSync(path.resolve('fixtures/putBucketAcl.json'), 'utf8'))

  logger.debug('handler()')
  await handler(data)
}

if (require.main === module) {
  main()
}
