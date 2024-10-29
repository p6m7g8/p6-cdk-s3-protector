AWS CDK setups up a Custom Resource via Cloud Formation which sets the AWS IAM Account Alias

# P6Namer

## LICENSE

[![License](https://img.shields.io/badge/License-Apache%202.0-yellowgreen.svg)](https://opensource.org/licenses/Apache-2.0)

## Other

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/p6m7g8/p6-cdk-namer) ![Sonarcloud Status](https://sonarcloud.io/api/project_badges/measure?project=p6m7g8_p6-cdk-namer&metric=alert_status) ![GitHub commit activity](https://img.shields.io/github/commit-activity/y/p6m7g8/p6-cdk-namer) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/p6m7g8/p6-cdk-namer)

## Usage

```ts
...
import { P6Namer } from 'p6-cdk-namer';

new P6Namer(this, 'AccountAlias', {
  accountAlias: 'THE-ALIAS',
});
```

## Architecture

![./assets/diagram.png](./assets/diagram.png)

## Author

Philip M. Gollucci <pgollucci@p6m7g8.com>
