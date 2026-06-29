import { compileAdd, compileSet, scalarPropsFrom } from './common.js'

const PARAGRAPH_KEYS = ['text', 'style', 'align', 'size', 'bold', 'italic', 'underline', 'color', 'font', 'spaceBefore', 'spaceAfter', 'lineSpacing', 'firstLineIndent']
const TABLE_KEYS = ['rows', 'cols', 'width', 'style', 'border', 'headerRows']
const PICTURE_KEYS = ['src', 'width', 'height', 'alt', 'align']
const COMMENT_KEYS = ['author', 'text', 'initials']
const FIELD_KEYS = ['fieldType', 'identifier', 'name', 'text', 'format']
const FORM_KEYS = ['alias', 'tag', 'placeholder', 'text', 'checked', 'items', 'defaultValue', 'type']

export function compileDocxAction(filePath, action, actionIndex, command) {
  switch (command) {
    case 'add_paragraph':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, PARAGRAPH_KEYS),
      }, actionIndex, { elementType: 'paragraph' })
    case 'add_heading': {
      const level = Math.min(Math.max(Number(action.level) || 1, 1), 6)
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, PARAGRAPH_KEYS, {
          style: `Heading${level}`,
          text: action.text || '',
        }),
      }, actionIndex, { elementType: 'paragraph' })
    }
    case 'add_table':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, TABLE_KEYS),
      }, actionIndex, { elementType: 'table' })
    case 'add_picture':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, PICTURE_KEYS),
      }, actionIndex, { elementType: 'picture' })
    case 'add_comment':
      return compileAdd(filePath, {
        ...action,
        props: scalarPropsFrom(action, COMMENT_KEYS),
      }, actionIndex, { elementType: 'comment' })
    case 'add_field':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, FIELD_KEYS),
      }, actionIndex, { elementType: 'field' })
    case 'add_header':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, ['type', 'text', 'align', 'size', 'field']),
      }, actionIndex, { elementType: 'header' })
    case 'add_footer':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/',
        props: scalarPropsFrom(action, ['type', 'text', 'align', 'size', 'field']),
      }, actionIndex, { elementType: 'footer' })
    case 'set_header_footer':
      return compileSet(filePath, {
        ...action,
        path: action.path || action.target || '/footer[1]',
        props: scalarPropsFrom(action, ['text', 'align', 'size', 'field']),
      }, actionIndex)
    case 'add_form_control':
      return compileAdd(filePath, {
        ...action,
        path: action.path || '/body',
        props: scalarPropsFrom(action, FORM_KEYS),
      }, actionIndex, { elementType: action.elementType || 'sdt' })
    default:
      return null
  }
}
