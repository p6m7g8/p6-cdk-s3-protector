import type { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import { P6CDKS3Protector } from '../src'

class VisualizeStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id)

    new P6CDKS3Protector(this, 'P6CDKS3Protector')
  }
}

const app = new cdk.App()
new VisualizeStack(app, 'VisualizeStack')
app.synth()
