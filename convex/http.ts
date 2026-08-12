import { httpRouter } from 'convex/server';
import { handleReplicateWebhook } from './music';
import { handleCorsPreflight, handleGenerate, handleHealth } from './announce';

const http = httpRouter();
http.route({
  path: '/replicate_webhook',
  method: 'POST',
  handler: handleReplicateWebhook,
});
// 「发布公告」动效页面（frontend/public/announce）的后端接口
http.route({
  path: '/api/health',
  method: 'GET',
  handler: handleHealth,
});
http.route({
  path: '/api/generate',
  method: 'POST',
  handler: handleGenerate,
});
http.route({
  path: '/api/generate',
  method: 'OPTIONS',
  handler: handleCorsPreflight,
});
export default http;
