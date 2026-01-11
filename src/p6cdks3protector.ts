import type { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdajs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cr from 'aws-cdk-lib/custom-resources'
import * as floyd from 'cdk-iam-floyd'

export class P6CDKS3Protector extends cdk.Resource {
  constructor(scope: Construct, id: string) {
    super(scope, id)

    const policy = new floyd.Statement.S3().allow().toPutObject().toPutObjectAcl()

    const onEvent = new lambdajs.NodejsFunction(this, 'p6CDKS3Protector', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(5), // Adjust timeout if necessary
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        externalModules: ['aws-sdk'],
      },
    })

    onEvent.addToRolePolicy(policy)

    const provider = new cr.Provider(this, 'P6CDKS3Protector/Provider', {
      onEventHandler: onEvent,
    })

    new cdk.CustomResource(this, 'P6CDKS3Protector/CR', {
      serviceToken: provider.serviceToken,
    })
  }
}
