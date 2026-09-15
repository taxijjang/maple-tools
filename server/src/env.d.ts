// wrangler.toml의 [[rules]] type="Text" globs=["**/*.html"]가 만드는 모듈 모양을 TS에 알려준다.
// 이게 없으면 tsc가 매번 "Cannot find module './page.html'"을 낸다.
declare module '*.html' {
  const content: string
  export default content
}
