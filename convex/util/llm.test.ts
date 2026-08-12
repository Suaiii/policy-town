import { getEmbeddingConfig } from './llm';

describe('getEmbeddingConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses dedicated embedding settings without changing chat settings', () => {
    process.env.LLM_API_URL = 'https://opencode.ai/zen/go';
    process.env.LLM_API_KEY = 'chat-key';
    process.env.LLM_MODEL = 'deepseek-v4-flash';
    process.env.EMBEDDING_API_URL = 'https://api.siliconflow.cn/v1';
    process.env.EMBEDDING_API_KEY = 'embedding-key';
    process.env.EMBEDDING_MODEL = 'BAAI/bge-m3';

    expect(getEmbeddingConfig()).toEqual({
      url: 'https://api.siliconflow.cn/v1',
      apiKey: 'embedding-key',
      model: 'BAAI/bge-m3',
    });
  });
});
