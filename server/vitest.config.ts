import { defineConfig } from 'vitest/config'

// wrangler.toml의 [[rules]] type="Text" globs=["**/*.html"]과 같은 뜻:
// .html을 파일 내용 그대로 문자열 default export로 취급한다. vitest(vite)는 이 규칙을
// 모르므로 직접 알려줘야 `import PAGE from './page.html'`이 테스트에서도 똑같이 동작한다.
export default defineConfig({
  plugins: [{
    name: 'html-as-raw-text',
    transform(code, id) {
      if (id.endsWith('.html')) return `export default ${JSON.stringify(code)}`
    },
  }],
})
