import { compileAdd, compileSet, scalarPropsFrom } from './common.js'

const CELL_KEYS = ['value', 'formula', 'bold', 'italic', 'color', 'fill', 'font', 'size', 'numberFormat', 'align', 'width', 'height']
const TABLE_KEYS = ['range', 'name', 'style', 'header', 'totals']
const CHART_KEYS = ['chartType', 'range', 'data', 'categories', 'series', 'title', 'x', 'y', 'w', 'h', 'width', 'height']

export function compileXlsxAction(filePath, action, actionIndex, command) {
  switch (command) {
    case 'add_sheet':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, ['name', 'index']),
      }, actionIndex, { elementType: 'sheet' })
    case 'set_cell':
      return compileSet(filePath, {
        ...action,
        path: action.path || action.cell,
        props: scalarPropsFrom(action, CELL_KEYS),
      }, actionIndex)
    case 'set_formula':
      return compileSet(filePath, {
        ...action,
        path: action.path || action.cell,
        props: scalarPropsFrom(action, ['formula'], { formula: action.formula || '' }),
      }, actionIndex)
    case 'set_range':
      return compileSet(filePath, {
        ...action,
        path: action.path || action.range,
        props: scalarPropsFrom(action, ['values', 'value', 'formula', 'bold', 'color', 'fill', 'numberFormat', 'align']),
      }, actionIndex)
    case 'add_table':
      return compileAdd(filePath, {
        ...action,
        path: action.path || action.range || '/',
        props: scalarPropsFrom(action, TABLE_KEYS),
      }, actionIndex, { elementType: 'table' })
    case 'add_chart':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, CHART_KEYS),
      }, actionIndex, { elementType: 'chart' })
    case 'define_name':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, ['name', 'ref', 'range', 'scope']),
      }, actionIndex, { elementType: 'namedrange' })
    default:
      return null
  }
}
