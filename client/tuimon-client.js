;(function () {
  'use strict'

  window.__tuimon_ready__ = false

  window.__tuimon_update__ = function (data) {
    window.__tuimon_ready__ = false
    window.dispatchEvent(new CustomEvent('tuimon:update', { detail: data }))
    window.__tuimon_ready__ = true
  }

  window.TuiMon = {
    onUpdate(callback) {
      window.addEventListener('tuimon:update', function (e) { callback(e.detail) })
    },

    set(selector, value) {
      var el = document.querySelector(selector)
      if (!el) return
      if (typeof value === 'string') el.textContent = value
      else if (typeof value === 'number') el.textContent = value.toLocaleString()
      else if (typeof value === 'object' && value !== null) Object.assign(el.style, value)
    },

    notify(message, duration) {
      duration = duration || 2000
      window.dispatchEvent(new CustomEvent('tuimon:notify', { detail: { message: message, duration: duration } }))
    },
  }

  // Auto-add shortcut badges to panels with data-tm-key
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tm-key]').forEach(function (panel) {
      var key = panel.getAttribute('data-tm-key')
      var label = panel.getAttribute('data-tm-label') || ''
      if (!key) return
      var badge = document.createElement('div')
      badge.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#58a6ff;padding:2px 8px;border-radius:4px;font-size:12px;font-family:monospace;pointer-events:none;z-index:10;'
      badge.textContent = '[' + key.toUpperCase() + ']' + (label ? ' ' + label : '')
      panel.style.position = panel.style.position || 'relative'
      panel.appendChild(badge)
    })
  })
})()
