from pathlib import Path

styles = Path('packages/semantic-map/renderer-maxgraph/styles.js')
text = styles.read_text(encoding='utf-8')
old = """    case 'vector-sector':
      return {
        ...common,
        shape: 'semanticSector',
        sectorStartAngle: visual?.sector?.startAngle ?? -90,
        sectorEndAngle: visual?.sector?.endAngle ?? 270,
        sectorInnerRatio: visual?.sector?.innerRatio ?? 0,
        sectorOuterRatio: visual?.sector?.outerRatio ?? 1,
        rounded: false,
        fontSize: 0,
        fontStyle: 0,
        shadow: false,
        movable: false,
        resizable: false,
        selectable: false,
        editable: false,
        connectable: false,
        deletable: false,
      };
"""
new = """    case 'vector-sector':
      return {
        ...common,
        shape: 'semanticSector',
        sectorStartAngle: visual?.sector?.startAngle ?? -90,
        sectorEndAngle: visual?.sector?.endAngle ?? 270,
        sectorInnerRatio: visual?.sector?.innerRatio ?? 0,
        sectorOuterRatio: visual?.sector?.outerRatio ?? 1,
        rounded: false,
        shadow: false,
      };
"""
if text.count(old) != 1:
    raise SystemExit('vector-sector style anchor changed')
styles.write_text(text.replace(old, new), encoding='utf-8')

boundary = Path('packages/semantic-map/tests/authoring_boundary_test.mjs')
text = boundary.read_text(encoding='utf-8')
old = "const adapter = read('packages/semantic-map/renderer-maxgraph/adapter.js');\n"
new = old + "const styles = read('packages/semantic-map/renderer-maxgraph/styles.js');\n"
if text.count(old) != 1:
    raise SystemExit('authoring boundary styles import anchor changed')
text = text.replace(old, new)
anchor = "assert.match(adapter, /editingPlugin\\?\\.textarea\\?\\.isConnected/);\n"
addition = anchor + "assert.doesNotMatch(styles, /case 'vector-sector':[\\s\\S]*?editable: false/);\n"
if text.count(anchor) != 1:
    raise SystemExit('authoring boundary styles assertion anchor changed')
boundary.write_text(text.replace(anchor, addition), encoding='utf-8')
