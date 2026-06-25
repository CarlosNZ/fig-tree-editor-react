import React, { useMemo, useEffect, useRef, useCallback } from 'react'
import { JsonData, ThemeStyles } from 'json-edit-react'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  isObject,
  isAliasString,
  OperatorNode,
  isFigTreeError,
  convertV1ToV2,
  convertToShorthand,
  convertFromShorthand,
  dequal,
} from 'fig-tree-evaluator'
import {
  // json-edit-react
  CustomNodeDefinition,
  JsonEditor,
  JsonEditorProps,
  NodeData,
  UpdateFunction,
  isCollection,
} from './_imports'
import './styles.css'
import { Operator } from './Operator'
import { Fragment } from './Fragment'
import { CustomOperator } from './CustomOperator'
import { TopLevelContainer } from './TopLevel'
import { validateExpression } from './validator'
import { type OperatorDisplay } from './operatorDisplay'
import {
  getCurrentOperator,
  isFirstAliasNode,
  isShorthandNodeCollection as shorthandWithCollectionTester,
  isShorthandNodeWithSimpleValue as shorthandSimpleNodeTester,
  propertyCountReplace,
  getAliases,
  getTypeFilter,
} from './helpers'
import { ShorthandNodeWithSimpleValue, ShorthandNodeCollection } from './Shorthand'

const nodeBaseStyles = {
  borderColor: 'transparent',
  transition: 'max-height 0.5s, border-color 0.5s, padding 0.5s',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: '0.75em',
}

// This is the block with the grey border. Basically an operator node without
// its header row (which contains the DisplayBar)
const innerCollectionSpacing = {
  marginLeft: '-1em',
  paddingRight: '1em',
  paddingLeft: '0.5em',
}
const innerCollectionRoundedBorder = {
  borderColor: '#dbdbdb',
  paddingTop: '0.5em',
  paddingBottom: '0.5em',
  marginBottom: '0.5em',
  ...innerCollectionSpacing,
}

export interface FigTreeEditorProps extends Omit<JsonEditorProps, 'data' | 'setData'> {
  figTree: FigTreeEvaluator
  expression: EvaluatorNode
  setExpression: (data: EvaluatorNode) => void
  objectData?: Record<string, unknown>
  onUpdate?: UpdateFunction
  onEvaluate: (value: unknown, e: React.MouseEvent) => void
  onEvaluateStart?: () => void
  onEvaluateError?: (err: unknown) => void
  operatorDisplay?: Partial<Record<OperatorName | 'FRAGMENT', OperatorDisplay>>
  styles?: Partial<ThemeStyles>
  defaultNewOperatorExpression?: EvaluatorNode
  defaultNewFragment?: string
  defaultNewCustomOperator?: string
  addTopLevelFallback?: EvaluatorNode
}

const FigTreeEditor: React.FC<FigTreeEditorProps> = ({
  figTree,
  expression,
  setExpression,
  objectData = {},
  onUpdate = () => {},
  onEvaluate,
  onEvaluateStart,
  onEvaluateError,
  operatorDisplay,
  styles = {},
  allowDelete,
  allowAdd,
  allowEdit,
  allowTypeSelection,
  defaultNewOperatorExpression,
  defaultNewFragment,
  defaultNewCustomOperator,
  addTopLevelFallback,
  ...props
}) => {
  const previousData = useRef<EvaluatorNode>(null)
  const operators = useMemo(() => figTree.getOperators(), [figTree])
  const fragments = useMemo(() => figTree.getFragments(), [figTree])
  const functions = useMemo(() => figTree.getCustomFunctions(), [figTree])

  const allOpAliases = useMemo(() => {
    const all = operators.map((op) => [op.name, ...op.aliases]).flat()
    return new Set(all)
  }, [])
  const allFragments = useMemo(() => new Set(fragments.map((f) => f.name)), [])
  const allFunctions = useMemo(() => new Set(functions.map((f) => f.name)), [])
  const allNonAliases = new Set([...allOpAliases, ...allFragments, ...allFunctions])

  const figTreeData = { operators, fragments, functions, allNonAliases }

  // Deeper nodes don't have access to higher-level alias definitions when
  // evaluating them on their own (only when evaluated from above), so we
  // collect all top-level aliases and pass them down to all child components
  // (Limitation: aliases defined part-way down the tree, i.e. lower than the
  // root, but higher than where they're used, won't be picked up for evaluation
  // at the inner nodes. But this is not a common scenario, and isn't a big deal
  // for the editor)
  const topLevelAliases = getAliases(expression, allNonAliases)

  // This effect is just for when the expression is changed by the parent
  // component -- we need to re-validate and update the expression if validation
  // has changed it. However, this is unnecessary for most changes to
  // expression, as the `onUpdate` function has already validated before setting
  // the state. So we do an equality check and early return if the data hasn't
  // hasn't changed from its previous value.
  useEffect(() => {
    if (dequal(previousData.current, expression)) return

    const exp = validateExpression(expression, { operators, fragments, functions })
    previousData.current = exp
    setExpression(exp)
  }, [expression])

  if (!figTree) return null

  const evaluateNode = async (expression: EvaluatorNode, e: React.MouseEvent) => {
    onEvaluateStart && onEvaluateStart()
    try {
      const result = await figTree.evaluate(expression, { data: objectData })
      onEvaluate(result, e)
    } catch (err) {
      if (isFigTreeError(err)) console.error(err.prettyPrint)
      onEvaluateError && onEvaluateError(err)
    }
  }

  const isShorthandNodeCollection = (nodeData: NodeData) =>
    shorthandWithCollectionTester(nodeData, allOpAliases, allFragments, allFunctions)
  const isShorthandNodeWithSimpleValue = (nodeData: NodeData) =>
    shorthandSimpleNodeTester(nodeData, allOpAliases, allFragments, allFunctions)

  const toShorthand = useCallback(
    (expression: EvaluatorNode) => convertToShorthand(expression, figTree),
    []
  )
  const fromShorthand = useCallback(
    (expression: EvaluatorNode) => convertFromShorthand(expression, figTree),
    []
  )
  const toV2 = useCallback((expression: EvaluatorNode) => convertV1ToV2(expression, figTree), [])

  const converters = { toShorthand, fromShorthand, toV2 }

  // Validates and persists a complete expression. Custom node components build
  // a new full expression (with `assign`, via `buildOnEdit`) and hand it here.
  // Updates `previousData` so the re-validation effect doesn't fire again.
  const updateExpression = useCallback(
    (newData: EvaluatorNode) => {
      try {
        const validated = validateExpression(newData, {
          operators,
          fragments,
          functions,
        }) as EvaluatorNode
        previousData.current = validated
        setExpression(validated)
      } catch (err) {
        console.error('Invalid expression update:', err)
      }
    },
    [operators, fragments, functions, setExpression]
  )

  const defaultFragment = useMemo(
    () =>
      fragments.find((frag) => frag.name === defaultNewFragment)?.name ??
      fragments?.[0]?.name ??
      null,
    [fragments, defaultNewFragment]
  )

  return (
    <JsonEditor
      // collapseAnimationTime={1000}
      className="ft-editor"
      showCollectionCount="when-collapsed"
      data={expression as JsonData}
      onUpdate={({ newData, ...rest }, control) => {
        try {
          const validated = validateExpression(newData as EvaluatorNode, {
            operators,
            fragments,
            functions,
          }) as object
          onUpdate({ newData: validated, ...rest }, control)
          previousData.current = validated
          return ['value', validated]
        } catch (err: any) {
          return err.message
        }
      }}
      allowDelete={(nodeData) => {
        const { key, path, parentData } = nodeData

        // Respect any caller-supplied allowDelete first (deny short-circuits)
        if (allowDelete === false) return false
        if (typeof allowDelete === 'function' && allowDelete(nodeData) === false) return false

        // The root node can't be deleted
        if (path.length === 0) return false

        // Allow unless this is a required operator parameter
        if (!isObject(parentData) || !('operator' in parentData)) return true
        const required = getCurrentOperator((parentData as OperatorNode).operator, operators)
          ?.parameters.filter((param) => param.required)
          .map((param) => [param.name, ...param.aliases])
          .flat()

        return !(required?.includes(key as string) ?? false)
      }}
      allowTypeSelection={(nodeData) => getTypeFilter(nodeData, { operators, fragments })}
      showArrayIndexes={false}
      indent={2}
      collapse={2}
      stringTruncateLength={100}
      {...props}
      setData={setExpression as (data: unknown) => void}
      theme={[
        {
          container: {},
          property: (nodeData) => {
            if (isAliasString(String(nodeData.key))) return { fontStyle: 'italic' }
          },
          string: ({ value }) => {
            if (isAliasString(String(value))) return { fontStyle: 'italic' }
          },
          bracket: (nodeData) => {
            const { value, collapsed } = nodeData
            if (
              !(
                isObject(value) &&
                ('operator' in value ||
                  'fragment' in value ||
                  isShorthandNodeWithSimpleValue(nodeData))
              )
            )
              return { display: 'inline' }
            if (!collapsed) return { display: 'none' }
          },
          itemCount: (nodeData) => {
            if (
              isObject(nodeData.value) &&
              ('operator' in nodeData.value ||
                'fragment' in nodeData.value ||
                isShorthandNodeWithSimpleValue(nodeData))
            )
              return { fontSize: '1.1em' }
          },
          collectionInner: [
            nodeBaseStyles,
            (nodeData) => {
              const { value, collapsed } = nodeData
              // Rounded border for Operator/Fragment nodes
              if (
                isObject(value) &&
                ('operator' in value ||
                  'fragment' in value ||
                  isShorthandNodeWithSimpleValue(nodeData))
              ) {
                return collapsed ? innerCollectionSpacing : innerCollectionRoundedBorder
              }
            },
          ],
        },
        styles,
      ]}
      customNodeDefinitions={[
        {
          // Anchored on the operator/fragment OBJECT (stable path), not the
          // `operator`/`fragment` key, so editing survives a type switch and
          // can use json-edit-react's built-in editing session.
          condition: ({ value }) =>
            isObject(value) &&
            'operator' in value &&
            allFunctions.has(String((value as OperatorNode).operator)),
          component: CustomOperator as unknown as CustomNodeDefinition['component'],
          componentProps: {
            figTreeData,
            evaluateNode,
            operatorDisplay,
            topLevelAliases,
            converters,
            addTopLevelFallback,
            updateExpression,
            defaultNewOperatorExpression,
            defaultNewFragment: defaultFragment,
            defaultNewCustomOperator,
          },
          // `showOnEdit` keeps the custom component (and its live child rows)
          // rendered while editing, instead of json-edit-react's JSON textarea.
          showOnEdit: true,
          showEditTools: false,
          showInTypeSelector: true,
        },
        {
          condition: ({ value }) =>
            isObject(value) &&
            'operator' in value &&
            !allFunctions.has(String((value as OperatorNode).operator)),
          component: Operator as unknown as CustomNodeDefinition['component'],
          name: 'Operator',
          componentProps: {
            figTreeData,
            evaluateNode,
            operatorDisplay,
            topLevelAliases,
            converters,
            addTopLevelFallback,
            updateExpression,
            defaultNewOperatorExpression,
            defaultNewFragment: defaultFragment,
            defaultNewCustomOperator,
          },
          showOnEdit: true,
          showEditTools: false,
          showInTypeSelector: true,
          defaultValue: defaultNewOperatorExpression ?? { operator: '+', values: [2, 2] },
        },
        {
          condition: ({ value }) => isObject(value) && 'fragment' in value,
          component: Fragment as unknown as CustomNodeDefinition['component'],
          name: 'Fragment',
          componentProps: {
            figTreeData,
            evaluateNode,
            operatorDisplay,
            topLevelAliases,
            converters,
            addTopLevelFallback,
            updateExpression,
            defaultNewOperatorExpression,
            defaultNewFragment: defaultFragment,
            defaultNewCustomOperator,
          },
          showOnEdit: true,
          showEditTools: false,
          showInTypeSelector: true,
          defaultValue: defaultFragment ? { fragment: defaultFragment } : null,
        },
        // {
        //   condition: (nodeData) => isShorthandNodeCollection(nodeData),
        //   showKey: false,
        //   wrapperComponent: ShorthandNodeCollection,
        //   wrapperProps: { figTree, evaluateNode, topLevelAliases, figTreeData, converters },
        // },
        // {
        //   condition: (nodeData) =>
        //     isFirstAliasNode(nodeData, allOpAliases, allFragments, allFunctions),
        //   showOnEdit: true,
        //   wrapperComponent: ({ children }) => (
        //     <div>
        //       <p className="ft-alias-header-text">
        //         <strong>Alias definitions:</strong>
        //       </p>
        //       {children}
        //     </div>
        //   ),
        // },
        // {
        //   condition: (nodeData) =>
        //     isShorthandNodeWithSimpleValue(nodeData) &&
        //     !isCollection(Object.values(nodeData.value ?? {})[0]),
        //   element: ShorthandNodeWithSimpleValue,
        //   componentProps: {
        //     figTree,
        //     figTreeData,
        //     evaluateNode,
        //     operatorDisplay,
        //     topLevelAliases,
        //     converters,
        //   },
        //   showEditTools: true,
        // },
        // {
        //   condition: (nodeData: any) => nodeData.path.length === 0 && isCollection(nodeData.data),
        //   element: TopLevelContainer,
        //   componentProps: {
        //     figTree,
        //     figTreeData,
        //     evaluateNode,
        //     isShorthandNode: isShorthandNodeWithSimpleValue,
        //   },
        // },
      ]}
      customText={{
        ITEMS_MULTIPLE: (nodeData) =>
          propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
        ITEM_SINGLE: (nodeData) =>
          propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
      }}
    />
  )
}

export default FigTreeEditor
