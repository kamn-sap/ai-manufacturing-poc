import { App } from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') || process.env.DEPLOY_STAGE || 'dev';
const appOrigin = app.node.tryGetContext('appOrigin')
  || process.env.APP_ORIGIN
  || 'http://localhost:5173';

if (!/^[a-z][a-z0-9-]{0,15}$/.test(stage)) {
  throw new Error('CDK stage must start with a lowercase letter and contain only lowercase letters, digits, or hyphens');
}

new FoundationStack(app, `AiManufacturingPoc-${stage}`, {
  stage,
  appOrigin,
});
