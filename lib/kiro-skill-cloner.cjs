'use strict';
const { PathRewriter } = require('./path-rewriter.cjs');

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const NAME_LINE_RE = /^name:\s*.+$/m;
const DISABLE_LINE_RE = /^disable-model-invocation:\s*true$/m;

class KiroSkillCloner {
  constructor({ runId }) {
    if (!runId) throw new Error('runId required');
    this._rewriter = new PathRewriter(runId);
  }

  clone(source, { newName } = {}) {
    if (!newName) throw new Error('newName required');
    const fm = FRONTMATTER_RE.exec(source);
    if (!fm) throw new Error('frontmatter required');
    let frontmatter = fm[1];
    if (!NAME_LINE_RE.test(frontmatter)) {
      throw new Error('frontmatter required: missing name field');
    }
    frontmatter = frontmatter.replace(NAME_LINE_RE, `name: ${newName}`);
    if (!DISABLE_LINE_RE.test(frontmatter)) {
      frontmatter = frontmatter + '\ndisable-model-invocation: true';
    }
    const body = source.slice(fm[0].length);
    const rewrittenBody = this._rewriter.rewrite(body);
    return `---\n${frontmatter}\n---\n${rewrittenBody}`;
  }
}

module.exports = { KiroSkillCloner };
