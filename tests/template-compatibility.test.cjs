const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const vendor = fs.readFileSync(path.join(root, 'main/vendor/vue-3.5.43.esm-browser.prod.js'), 'utf8')
const vue = import(`data:text/javascript;base64,${Buffer.from(vendor + '\n//# sourceURL=cutout-vue-compiler-fixture.js').toString('base64')}`)

// Simulate the precise DOM mutation made by iOS telephone detection. This is
// a compiler regression check, not a claim to run native iPhone heuristics.
function detectTelephoneNumbers(template) {
  return template.replace(/\{\{[\s\S]*?\}\}/g, expression => expression.replace(/\b\d{7,}\b/g, digits => `<a href="tel:${digits}">${digits}</a>`))
}

test('injected telephone links reproduce the reported Vue compiler syntax error', async () => {
  const { compile } = await vue
  const original = '<small>{{ (output.bytes / 1048576).toFixed(1) }} MB</small>'
  assert.doesNotThrow(() => compile(original))
  assert.throws(() => compile(detectTelephoneNumbers(original)), /Unexpected token ['"]?</)
})

test('the complete app template compiles with no detector-sensitive numeric expressions', async () => {
  const { compile } = await vue
  const html = fs.readFileSync(path.join(root, 'main/index.html'), 'utf8')
  assert.match(html, /<meta name="format-detection" content="telephone=no"\s*\/>/)
  const template = html.slice(html.indexOf('<template id="app-template">') + '<template id="app-template">'.length, html.lastIndexOf('</template>'))
  assert.equal(detectTelephoneNumbers(template), template, 'Keep long numeric literals out of in-DOM Vue expressions')
  // Decode the only HTML text entity here because Node has no native DOM for
  // the browser compiler's entity decoder. The render function is not executed.
  assert.doesNotThrow(() => compile(template, { decodeEntities: text => text.replaceAll('&amp;', '&') }))
  assert.match(template, /memoryMB\(output.bytes\)/)
})
