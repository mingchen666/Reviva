import { compileAdd, scalarPropsFrom } from './common.js'

const SHAPE_KEYS = ['name', 'preset', 'text', 'x', 'y', 'w', 'h', 'width', 'height', 'fill', 'line', 'font', 'size', 'color', 'bold', 'align', 'animation']
const PICTURE_KEYS = ['src', 'x', 'y', 'w', 'h', 'width', 'height', 'alt', 'crop', 'opacity']
const CHART_KEYS = ['chartType', 'data', 'categories', 'series', 'title', 'x', 'y', 'w', 'h', 'width', 'height']
const CONNECTOR_KEYS = ['name', 'x1', 'y1', 'x2', 'y2', 'begin', 'end', 'line', 'arrow', 'color', 'width']

export function compilePptxAction(filePath, action, actionIndex, command) {
  switch (command) {
    case 'add_slide':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, ['title', 'layout', 'background']),
      }, actionIndex, { elementType: 'slide' })
    case 'add_shape':
    case 'add_textbox':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/slide[1]',
        props: scalarPropsFrom(action, SHAPE_KEYS),
      }, actionIndex, { elementType: 'shape' })
    case 'add_picture':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/slide[1]',
        props: scalarPropsFrom(action, PICTURE_KEYS),
      }, actionIndex, { elementType: 'picture' })
    case 'add_chart':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/slide[1]',
        props: scalarPropsFrom(action, CHART_KEYS),
      }, actionIndex, { elementType: 'chart' })
    case 'add_speaker_notes':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/slide[1]',
        props: scalarPropsFrom(action, ['text', 'author']),
      }, actionIndex, { elementType: 'notes' })
    case 'add_connector':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/slide[1]',
        props: scalarPropsFrom(action, CONNECTOR_KEYS),
      }, actionIndex, { elementType: 'connector' })
    default:
      return null
  }
}
