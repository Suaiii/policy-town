import { fileURLToPath } from 'node:url';

// 仓库脚本从根目录运行（vite frontend），tailwind 默认只从 CWD 找配置，
// 这里显式指向 frontend 内的 tailwind.config.js，否则 content 为空、utilities 不生成。
const tailwindConfig = fileURLToPath(
  new URL('./tailwind.config.js', import.meta.url),
);

export default {
  plugins: {
    tailwindcss: { config: tailwindConfig },
    autoprefixer: {},
  },
};
