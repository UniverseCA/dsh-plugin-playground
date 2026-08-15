// Copy-Format Badge — Client 半边（纯客户端，无 Host 半边）
// 在每条 AI（assistant）回复的图标栏 conversation.chat.assistant-actions 注入两个按钮：
//   「MD」  —— 以原始 Markdown 复制该条回答
//   「TXT」 —— 以纯文本（剥去 Markdown 语法）复制该条回答
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 数据来源：客户端会话快照 —— 框架为标准会话级 slot 组件注入 useSession 钩子，
//   通过 snap.chat.nodes / snap.nodes 按 AssistantMessageNode.messageId 取到 blocks。
//
// 说明：
//   · assistant-actions 是 list 类型、session 作用域的 slot，组件会收到
//     { messageId, sessionId, useSession, useProjection, t, ... }。
//   · 只作用于已 finalize 的 assistant 消息（messageId 存在）；被中断的 partial
//     messageId 缺失，此时按钮置灰。
//   · 纯文本剥离用轻量正则：保留正文，去掉 # * _ ` > 与行内代码标记等。

function CopyFormatActions(props) {
  const useSession = props.useSession
  const messageId = props.messageId
  // 取到该 messageId 对应 assistant 节点的 text 块
  const blocks = useSession(function (snap) {
    // 优先走 snap.chat.nodes（稳定 keyed store）；回退到顶层 nodes 数组
    var node = null
    if (snap && snap.chat && snap.chat.nodes && typeof snap.chat.nodes.get === 'function') {
      // nodes 按 key（context key）寻址，需遍历 values 找 messageId —— 代价可控且每次快照都小
      var vals = snap.chat.nodes.values()
      for (var i = 0; i < vals.length; i++) {
        if (vals[i] && vals[i].kind === 'assistant' && vals[i].messageId === messageId) { node = vals[i]; break }
      }
    }
    if (!node && snap && Array.isArray(snap.nodes)) {
      for (var j = 0; j < snap.nodes.length; j++) {
        if (snap.nodes[j] && snap.nodes[j].kind === 'assistant' && snap.nodes[j].messageId === messageId) { node = snap.nodes[j]; break }
      }
    }
    return node ? node.blocks : null
  })

  // 取 Markdown 原文：连接所有 kind==='text' 块（与 DSH 自带复制的 text 一致）
  const md = (blocks || []).filter(function (b) { return b && b.kind === 'text' && typeof b.text === 'string' }).map(function (b) { return b.text }).join('')

  // 轻量 Markdown -> 纯文本剥离
  function toPlain(mdText) {
    if (!mdText) return ''
    var s = mdText
      // 去掉围栏代码块标记，保留其中内容
      .replace(/```[^\n]*\n?/g, '')
      // 去掉行内代码反引号
      .replace(/`([^`]*)`/g, '$1')
      // 去掉粗体/斜体标记
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)([^*_\n]+)\1/g, '$2')
      // 去掉标题 # 号
      .replace(/^#{1,6}\s+/gm, '')
      // 去掉引用 >
      .replace(/^[ \t]*>[ \t]?/gm, '')
      // 去掉行首的无序列表标记
      .replace(/^[ \t]*[-*+][ \t]+/gm, '')
      // 去掉链接，保留文字： [文字](url) -> 文字
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 去掉行内图片相同处理后留下的残留
      .replace(/!\s*/g, '')
    // 合并空格、清理空行
    s = s.replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
    return s
  }
  const plain = toPlain(md)

  const [copied, setCopied] = React.useState(null) // null | 'md' | 'txt' | 'fail'
  const pending = React.useRef(false)

  function doCopy(text) {
    if (!text) return
    if (pending.current) return
    pending.current = true
    var done = function (ok, which) {
      pending.current = false
      if (!ok) { setCopied('fail'); window.setTimeout(function () { setCopied(null) }, 1500); return }
      setCopied(which)
      window.setTimeout(function () { setCopied(null) }, 1200)
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(function () { done(true, copiedRef.current) }, function () { fallbackCopy(text, done) })
    } else {
      fallbackCopy(text, done)
    }
  }
  // 记录本次点击想复制的格式，供异步回调里区分提示文案
  var copiedRef = React.useRef('md')
  function onCopy(which) {
    copiedRef.current = which
    var text = which === 'md' ? md : plain
    if (!text) return
    doCopy(text)
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      var ok = document.execCommand('copy')
      document.body.removeChild(ta)
      done(ok, copiedRef.current)
    } catch (e) { done(false, copiedRef.current) }
  }

  var hasText = md.length > 0
  var btnStyle = {
    width: 34, height: 28, color: 'var(--dsw-alias-label-tertiary, #9aa0aa)',
    cursor: hasText ? 'pointer' : 'default', background: '0 0', border: 'none',
    borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    display: 'inline-flex', fontSize: 12, fontWeight: 600, padding: '0 6px'
  }
  var activeBtn = function (c) {
    return c === null ? btnStyle : Object.assign({}, btnStyle, { color: '#3ecf8e' })
  }

  var mdLabel = copied === 'md' ? '已复制' : 'MD'
  var txtLabel = copied === 'txt' ? '已复制' : 'TXT'

  return React.createElement('div', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: -4 }
  },
    React.createElement('button', {
      type: 'button', disabled: !hasText || copied === 'fail',
      title: '复制为 Markdown',
      'aria-label': '复制为 Markdown',
      style: activeBtn(copied === 'md' ? 'md' : null),
      onClick: function () { onCopy('md') }
    }, mdLabel),
    React.createElement('button', {
      type: 'button', disabled: !hasText || copied === 'fail',
      title: '复制为纯文本',
      'aria-label': '复制为纯文本',
      style: activeBtn(copied === 'txt' ? 'txt' : null),
      onClick: function () { onCopy('txt') }
    }, txtLabel))
}

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('conversation.chat.assistant-actions', function () {
      return slots.register(
        {
          name: 'conversation.chat.assistant-actions',
          id: 'copy-format',
          label: 'Copy as MD/TXT',
          order: 5
        },
        function (props) { return React.createElement(CopyFormatActions, props) })
    })
  }
}
