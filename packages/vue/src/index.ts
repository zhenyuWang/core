// This entry is the "full-build" that includes both the runtime
// and the compiler, and supports on-the-fly compilation of the template option.
//这个入口包含运行时的“full-build”和编译器，并支持动态编译模板选项。
import { initDev } from './dev'
import { compile, CompilerOptions, CompilerError } from '@vue/compiler-dom'
import { registerRuntimeCompiler, RenderFunction, warn } from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'
import { isString, NOOP, generateCodeFrame, extend } from '@vue/shared'
import { InternalRenderFunction } from 'packages/runtime-core/src/component'

if (__DEV__) {
  initDev()
}
// 创建缓存对象，缓存编译过的模板
const compileCache: Record<string, RenderFunction> = Object.create(null)

function compileToFunction(
  template: string | HTMLElement,
  options?: CompilerOptions
): RenderFunction {
  if (!isString(template)) {
    if (template.nodeType) {
      template = template.innerHTML
    } else {
      __DEV__ && warn(`invalid template option: `, template)
      return NOOP
    }
  }
  // 创建 key
  const key = template
  // 如果之前编译过，直接返回
  const cached = compileCache[key]
  if (cached) {
    return cached
  }
  // 如果第一个字符是 # 说明是一个 dom id
  if (template[0] === '#') {
    // 获取 dom
    const el = document.querySelector(template)
    // 如果没有获取到节点，返回警告
    if (__DEV__ && !el) {
      warn(`Template element not found or is empty: ${template}`)
    }
    // __UNSAFE__
    // Reason: potential execution of JS expressions in in-DOM template.
    // 因为在 dom 模板中可以执行 JS 表达式
    // The user must make sure the in-DOM template is trusted. If it's rendered
    // 所以必须确保 dom 模板是可信的，如果它要被呈现
    // by the server, the template should not contain any user data.
    // 在服务器端，模板不应该包含任何用户数据
    // 如果获取到了节点，更新 template 为 dom innerHTML，否则为空串
    template = el ? el.innerHTML : ``
  }

  const opts = extend(
    {
      hoistStatic: true,
      onError: __DEV__ ? onError : undefined,
      onWarn: __DEV__ ? e => onError(e, true) : NOOP
    } as CompilerOptions,
    options
  )

  if (!opts.isCustomElement && typeof customElements !== 'undefined') {
    opts.isCustomElement = tag => !!customElements.get(tag)
  }

  const { code } = compile(template, opts)

  function onError(err: CompilerError, asWarning = false) {
    const message = asWarning
      ? err.message
      : `Template compilation error: ${err.message}`
    const codeFrame =
      err.loc &&
      generateCodeFrame(
        template as string,
        err.loc.start.offset,
        err.loc.end.offset
      )
    warn(codeFrame ? `${message}\n${codeFrame}` : message)
  }

  // The wildcard import results in a huge object with every export
  // with keys that cannot be mangled, and can be quite heavy size-wise.
  // In the global build we know `Vue` is available globally so we can avoid
  // the wildcard object.
  const render = (
    __GLOBAL__ ? new Function(code)() : new Function('Vue', code)(runtimeDom)
  ) as RenderFunction

  // mark the function as runtime compiled
  // 将函数标记为运行时编译的
  ;(render as InternalRenderFunction)._rc = true
  // 将 render 通过 key 保存并返回
  return (compileCache[key] = render)
}

registerRuntimeCompiler(compileToFunction)
// 将 compileToFunction 作为 compile 返回
export { compileToFunction as compile }
// 导入 runtime-dom 中的所有导出，并再次导出
export * from '@vue/runtime-dom'
