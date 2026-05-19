# License History & Transition Notes

## Current license (v7.0.0+)

Pipeline Orchestrator v7.0.0 and all subsequent versions are licensed under
**[PolyForm Shield License 1.0.0](LICENSE)**.

This is a source-available license that allows nearly all uses (personal,
internal, educational, non-commercial, modification, redistribution) but
includes a **Noncompete** clause that prohibits using this software to
provide a competing product to others. See the `Noncompete` section of
[LICENSE](LICENSE) for the precise wording.

In plain language:

- **You CAN:** install and use the plugin for any purpose internal to your
  team or company; fork and modify it; redistribute copies; build private
  internal tooling on top of it; learn from the architecture.
- **You CANNOT:** package this software (modified or unmodified) and offer
  it to third parties as a substitute for the functionality of Pipeline
  Orchestrator itself — that is, you cannot build a directly competing
  commercial pipeline-orchestration product around our code.

If you need a commercial license carve-out for a use case the Shield
license does not permit, please open a discussion in the
[Issues](https://github.com/fernandoxavier02/Pipeline-Orchestrator/issues)
tab or reach out to FX Studio AI directly.

## Why we changed

Versions v1.0.0 through v6.3.0 (inclusive) were released under the MIT
license — fully permissive, including for commercial resale and competing
product offerings. As Pipeline Orchestrator matures and gains adoption, we
believe the discipline mechanics, gate hierarchy, adversarial review
patterns, and TRACE.md audit-trail format represent meaningful original
work that deserves protection from being repackaged and sold as a
competing product without contribution back.

The Shield license preserves the spirit of open source — read the code,
fork it, modify it, run it freely — while reserving the **commercial
competition vector** that pure MIT leaves wide open. This is the same
pattern adopted by HashiCorp (BSL), Sentry (BSL), Elastic (Elastic
License), MongoDB (SSPL), MinIO (AGPL), and many other commercially
operated open-source projects since 2018.

## What this means for existing users

### v1.0.0 through v6.3.0 — MIT (perpetual)

If you installed Pipeline Orchestrator at version 6.3.0 or earlier, the
MIT license applies to that copy permanently. The historical MIT text:

```
MIT License

Copyright (c) 2026 FX Studio AI

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

You may continue to use, redistribute, and modify v6.3.0 and earlier
under MIT terms. You may also choose to upgrade to v7.0.0+ under the
Shield license — your call.

### v7.0.0 onward — Shield

All new versions, patches, and features released starting with v7.0.0
are governed by the PolyForm Shield License 1.0.0 ([LICENSE](LICENSE)).
By installing v7.0.0+, you accept those terms.

### Forks of pre-v7 code

A fork of the codebase at any commit before the v7.0.0 release (commit
that ships with this LICENSE) inherits the MIT license that was in
effect at that time. The license change is forward-looking; it cannot
retroactively re-license commits that were already published under MIT.

If you fork from v7.0.0 or later, your fork is governed by Shield.

## Trademark and project identity

The names **"Pipeline Orchestrator"** and **"FX Studio AI"** are
trademarks of FX Studio AI. The Shield license grants you copyright and
patent rights to the code, but does not grant trademark rights to the
project names or logos. Forks must use a different name to avoid
trademark confusion.

This is consistent with how Linux (the trademark is owned by the Linux
Foundation despite GPL on the code) and Mozilla (Firefox trademark is
separate from the open-source codebase) handle the same separation.

## Questions

- **"Can I use Pipeline Orchestrator internally at my company?"** Yes,
  freely. Internal use across any size of team or organization is a
  permitted purpose under Shield.

- **"Can I modify it for my own use?"** Yes, freely. Shield allows
  unrestricted modification for any permitted purpose.

- **"Can I redistribute modified copies?"** Yes, as long as the modified
  copies remain under Shield and you preserve the license + notices,
  including stating that you modified the software.

- **"Can I sell support, consulting, or training services around Pipeline
  Orchestrator?"** Yes. The license does not restrict services. Only the
  packaging-and-reselling of the software itself as a competing product
  is restricted.

- **"Can I build a SaaS that uses Pipeline Orchestrator internally to
  power my own product (not the orchestrator itself)?"** Yes, as long as
  the SaaS is not a substitute for Pipeline Orchestrator's functionality
  to third parties.

- **"Can I build a SaaS that resells Pipeline Orchestrator as a hosted
  service?"** No. This is the "competing product" case the license
  exists to prevent.

- **"Is Shield OSI-approved?"** No, Shield is source-available rather
  than OSI-approved open source. The trade-off is intentional: stronger
  protection at the cost of strict FOSS classification.

- **"I have a use case the license does not permit. Can I get a
  commercial carve-out?"** Yes, FX Studio AI is open to commercial
  licensing discussions. Open an issue or reach out directly.
