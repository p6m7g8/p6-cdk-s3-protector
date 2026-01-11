import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'

import { P6CDKS3Protector } from '../src'

it('p6CDK3Protector components', () => {
  // GIVEN
  const app = new cdk.App()
  const stack = new cdk.Stack(app, 'MyStack')

  // WHEN
  new P6CDKS3Protector(stack, 'p6-cdk-s3-protector')

  // THEN
  const template = Template.fromStack(stack)
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.handler',
    Runtime: 'nodejs24.x',
  })
  template.resourceCountIs('AWS::Lambda::Function', 2) // Custom Resource Handler counts too
})
