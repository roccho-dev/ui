# One-time source relocation: exact input tree and exact output tree are checked externally.
# This file is not part of the product tree and performs no network or Git ref write.
from pathlib import Path
import json, re, posixpath, subprocess

dest=Path.cwd()
move = {
 'packages/a2ui-adapter-artifacts': 'adapters/a2ui-adapter-artifacts',
 'packages/a2ui-browser': 'adapters/a2ui-browser',
 'packages/artifact-invocation': 'capabilities/artifact-invocation',
 'packages/artifact-reference': 'capabilities/artifact-reference',
 'packages/business-model': 'capabilities/business-model',
 'packages/connectability': 'capabilities/connectability',
 'packages/control': 'capabilities/control',
 'packages/core-port': 'capabilities/core-port',
 'packages/data-pin': 'capabilities/data-pin',
 'packages/decision-packet': 'capabilities/decision-packet',
 'packages/presentation': 'capabilities/presentation',
 'packages/semantic-map-profiles': 'capabilities/semantic-map-profiles',
 'packages/semantic-map': 'capabilities/semantic-map',
 'packages/source-compiler': 'capabilities/source-compiler',
 'packages/ui-claims': 'governance/ui-claims',
 'packages/ui-ir': 'capabilities/ui-ir',
 'packages/ui-projection-evidence': 'governance/ui-projection-evidence',
 'packages/ui-receipts': 'governance/ui-receipts',
 'packages/url-module': 'capabilities/url-module',
}
def mapped(p):
 for o,n in move.items():
  if p==o or p.startswith(o+'/'):return n+p[len(o):]
 return p
paths=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
paths=[p for p in paths if p]
assert len(paths)==736, len(paths)
original={p:(dest/p).read_bytes() for p in paths}
fs=[{'path':p} for p in paths]
for o,n in move.items():
 (dest/n).parent.mkdir(parents=True,exist_ok=True)
 assert not (dest/n).exists(),n
 (dest/o).rename(dest/n)
(dest/'packages').rmdir()
history=lambda p: p.startswith(('proposals/','docs/proposals/','docs/purpose-atlas-v6-a2ui/')) or p=='docs/retirement-governance-audit-260703.md'
opaque={'tests/fixtures/nix-package-artifacts/index.html','tests/fixtures/contract-model-atlas/data.contract-model-atlas.v1.jsonl','apps/artifact-shell/generated/capability-registry.mjs'}
def replace_roots(s):
 for o,n in sorted(move.items(), key=lambda x:-len(x[0])):
  s=s.replace(o,n).replace(o.replace('/','\\/'),n.replace('/','\\/'))
 return s
changes=[]
for e in fs:
 p=e['path']; target=dest/mapped(p)
 if history(p) or p in opaque or '/vendor/' in p or '/reference/' in p or 'LICENSE' in p or 'THIRD_PARTY' in p:continue
 try:old=original[p].decode()
 except UnicodeError:continue
 new=old
 if p=='flake.nix':
  for o,n in move.items():new=new.replace('${self}/'+o,'${self}/'+n)
 elif p=='.github/workflows/nix-package-artifacts.yml':
  new=''.join(line if '.artifact-proof/packages/' in line else replace_roots(line) for line in old.splitlines(keepends=True))
 else:new=replace_roots(old)
 for o,n in move.items():
  _,name=o.split('/',1); group=n.split('/',1)[0]
  new=re.sub(r'''(["'])packages\1(\s*[,/]\s*)(["'])'''+re.escape(name)+r'\3',lambda m:f'{m[1]}{group}{m[1]}{m[2]}{m[3]}{name}{m[3]}',new)
 if p.endswith(('.mjs','.js')):
  def rel(m):
   q,s=m[1],m[2]
   if not s.startswith('.') or not s.strip('./'):return m[0]
   clean=s.split('?',1)[0].split('#',1)[0]
   t=posixpath.normpath(posixpath.join(posixpath.dirname(p),clean))
   if not (t in original or any(f.startswith(t.rstrip('/')+'/') for f in original)):return m[0]
   v=posixpath.relpath(mapped(t),posixpath.dirname(mapped(p)))
   if not v.startswith('.'):v='./'+v
   if clean.endswith('/') and not v.endswith('/'):v+='/'
   return q+v+s[len(clean):]+q
  pairs={}
  for m in re.finditer(r'''(["'])([^"'\n]+)\1''',old):
   r=rel(m)
   if r!=m[0]: pairs[replace_roots(m[0])]=r
  for a,b in pairs.items(): new=new.replace(a,b)
 if new!=old:
  target.write_text(new);changes.append({'from':p,'to':mapped(p)})
p=dest/'apps/artifact-shell/scripts/build-registry.mjs';s=p.read_text();s=s.replace('path.join(repoRoot, "packages", packageId)','path.join(repoRoot, "capabilities", packageId)');p.write_text(s)
p=dest/'apps/artifact-shell/src/services.mjs';s=p.read_text().replace('../../../packages/${token}/runtime.js','../../../capabilities/${token}/runtime.js');p.write_text(s)
p=dest/'tests/check-ui-forbidden-authority-boundary.mjs';s=p.read_text().replace("['packages', 'scripts']", "['capabilities', 'adapters', 'governance/ui-claims', 'governance/ui-projection-evidence', 'governance/ui-receipts', 'scripts']");p.write_text(s)
p=dest/'apps/preview/main.mjs';s=p.read_text();s=s.replace("import.meta.glob('../../packages/*/feature.mjs', { eager: true })", "import.meta.glob(['../../capabilities/*/feature.mjs', '../../adapters/*/feature.mjs'], { eager: true })")
s=s.replace("import.meta.glob('../../packages/**/model.mjs')", "import.meta.glob(['../../capabilities/**/model.mjs', '../../adapters/**/model.mjs'])")
s=s.replace("import.meta.glob('../../packages/**/*.css')", "import.meta.glob(['../../capabilities/**/*.css', '../../adapters/**/*.css'])")
s=re.sub(r"  '../../packages/([^']+)',", lambda m: f"  '../../capabilities/{m[1]}',\n  '../../adapters/{m[1]}',", s);p.write_text(s)
p=dest/'flake.nix';s=p.read_text()
s=s.replace('      mkControlUi = pkgs:', '''      restoreA2uiDistributionPaths = ''
        substituteInPlace "$out/packages/a2ui-browser/src/jsonl-surface.mjs" \\
          --replace-fail '../../../capabilities/core-port/' '../../core-port/'
      '';
      mkControlUi = pkgs:''')
s=s.replace('          node --check "$out/apps/control/main.mjs"', '''          ${restoreA2uiDistributionPaths}
          substituteInPlace "$out/apps/control/main.mjs" \\
            --replace-fail '/adapters/a2ui-browser/' '/packages/a2ui-browser/' \\
            --replace-fail '/capabilities/control/' '/packages/control/'
          substituteInPlace "$out/packages/control/model.mjs" \\
            --replace-fail '../../adapters/a2ui-browser/' '../a2ui-browser/'
          substituteInPlace "$out/packages/a2ui-browser/feature.mjs" \\
            --replace-fail 'adapters/a2ui-browser/' 'packages/a2ui-browser/' \\
            --replace-fail 'capabilities/control/' 'packages/control/' \\
            --replace-fail 'capabilities/presentation/' 'packages/presentation/' \\
            --replace-fail 'capabilities/semantic-map/' 'packages/semantic-map/'
          node --check "$out/apps/control/main.mjs"''')
s=s.replace('          test -s "$out/packages/a2ui-browser/src/index.mjs"', '''          ${restoreA2uiDistributionPaths}
          test -s "$out/packages/a2ui-browser/src/index.mjs"''')
s=s.replace('          test -s "$out/packages/semantic-map/runtime.js"', '''          substituteInPlace "$out/packages/semantic-map/feature.mjs" \\
            --replace-fail 'capabilities/semantic-map/' 'packages/semantic-map/'
          test -s "$out/packages/semantic-map/runtime.js"''')
p.write_text(s)
p=dest/'apps/preview/tests/preview.mjs';s=p.read_text();s=s.replace("assert.match(main, /import\\.meta\\.glob\\('\\.\\.\\/\\.\\.\\/packages\\/\\*\\/feature\\.mjs'/u);", "assert.match(main, /import\\.meta\\.glob\\(\\[/u);\nfor (const group of ['capabilities', 'adapters']) {\n  assert.ok(main.includes(`../../${group}/*/feature.mjs`));\n  assert.ok(main.includes(`../../${group}/**/model.mjs`));\n  assert.ok(main.includes(`../../${group}/**/*.css`));\n}")
s=s.replace("featureRuntimeSource: 'packages/*/feature.mjs',", "featureRuntimeSource: ['capabilities/*/feature.mjs', 'adapters/*/feature.mjs'],")
p.write_text(s)
p=dest/'README.md';s=p.read_text().replace('`packages/**`', '`capabilities/**` and `adapters/**`')
s=s.replace('## Source placement\n', '## Source placement\n\nReusable abilities live in `capabilities/`; environment-specific connections live\nin `adapters/`; thin user entrypoints live in `apps/`. This is not a mandatory\ninternal layout or language for every ability. Web is one interface, not the\nwhole UI repository. Existing evidence surfaces live under `governance/`.\n\nSource paths and distribution paths are separate. The consumer-ready Nix outputs\nkeep their public `packages/...` layout; consumers do not follow source moves.\nThe build reconnects their static references, without a source-tree fallback.\n\n')
p.write_text(s)
p=dest/'docs/ownership-boundaries.md';s=p.read_text().replace('`packages/**`', '`capabilities/**` and `adapters/**`')
s=s.replace('## Three different questions', 'Current source placement: `capabilities/` contains reusable abilities,\n`adapters/` environment connections, `apps/` thin entrypoints, and `governance/`\nthe existing UI evidence surfaces. Published Nix paths remain a separate\nconsumer contract; a source move is not a required consumer rewrite.\n\n## Three different questions')
p.write_text(s)
subprocess.run(['node','apps/artifact-shell/scripts/build-registry.mjs'],check=True)
subprocess.run(['git','add','--all'],check=True)
tree=subprocess.check_output(['git','write-tree']).decode().strip()
assert tree=='00854307d85235514e0ef3150e04d88440f6c47f', tree
print(json.dumps({'tree':tree, 'files':len(paths), 'source_packages':(dest/'packages').exists()}))
