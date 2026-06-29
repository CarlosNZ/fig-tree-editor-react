import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { toPathString, type ThemeStyles } from 'json-edit-react'
import {
  type EvaluatorNode,
  type FigTreeEvaluator,
  type Operator as OperatorName,
  type OperatorNode,
  isObject,
  isOperatorNode,
  isFragmentNode,
  isAliasString,
  isFigTreeError,
  convertV1ToV2,
  convertToShorthand,
  convertFromShorthand,
  dequal,
} from 'fig-tree-evaluator'
import {
  // json-edit-react
  type CustomNodeDefinition,
  type CustomTextDefinitions,
  JsonEditor,
  type JsonEditorProps,
  type NodeData,
  type ThemeInput,
  type UpdateFunction,
  isCollection,
} from './_imports'
import { and, collections, not, root, type FilterPredicate } from '@json-edit-react/utils/filters'
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
  isShorthandNode as shorthandNodeTester,
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
  paddingRight: '0.5em',
  paddingLeft: '0.5em',
}
const innerCollectionRoundedBorder = {
  borderColor: '#dbdbdb',
  paddingTop: '0.5em',
  paddingBottom: '0.5em',
  marginBottom: '0.5em',
  ...innerCollectionSpacing,
}

// Stable empty defaults for optional object props. An inline `= {}` default
// allocates a fresh object each render, which would churn the deps of the
// memoised `evaluateNode` / `theme` and defeat the node memo downstream.
const EMPTY_OBJECT: Record<string, unknown> = {}
const EMPTY_STYLES: Partial<ThemeStyles> = {}

// Wrap a consumer callback so its identity stays STABLE across renders (so the
// memoised `evaluateNode` — and the json-edit-react node memo downstream — can
// bail out) while always invoking the LATEST implementation, even when the
// consumer passes it inline (as the demo does). Mirrors json-edit-react's own
// `useStableCallback`. Returns `undefined` when no callback is supplied, so the
// optional-callback guards (`onEvaluateStart && ...`) still hold.
const useStableCallback = <Args extends unknown[], R>(
  cb: ((...args: Args) => R) | undefined
): ((...args: Args) => R) | undefined => {
  const ref = useRef(cb)
  if (cb) ref.current = cb
  const stable = useRef((...args: Args): R => ref.current!(...args))
  return cb ? stable.current : undefined
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
  objectData = EMPTY_OBJECT,
  onUpdate = () => {},
  onEvaluate,
  onEvaluateStart,
  onEvaluateError,
  operatorDisplay,
  styles = EMPTY_STYLES,
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
  // `figTree` is a required prop, but guard defensively in case a consumer
  // passes it before it's constructed. Render-phase hooks therefore tolerate a
  // missing `figTree`; the `if (!figTree) return null` guard lives AFTER all
  // hooks (just before the render), per the Rules of Hooks.
  const operators = useMemo(() => figTree?.getOperators() ?? [], [figTree])
  const fragments = useMemo(() => figTree?.getFragments() ?? [], [figTree])
  const functions = useMemo(() => figTree?.getCustomFunctions() ?? [], [figTree])

  const allOpAliases = useMemo(() => {
    const all = operators.map((op) => [op.name, ...op.aliases]).flat()
    return new Set(all)
  }, [operators])
  const allFragments = useMemo(() => new Set(fragments.map((f) => f.name)), [fragments])
  const allFunctions = useMemo(() => new Set(functions.map((f) => f.name)), [functions])
  const allNonAliases = useMemo(
    () => new Set([...allOpAliases, ...allFragments, ...allFunctions]),
    [allOpAliases, allFragments, allFunctions]
  )

  const figTreeData = useMemo(
    () => ({ operators, fragments, functions, allNonAliases }),
    [operators, fragments, functions, allNonAliases]
  )

  // When a node's type is switched (Operator↔Fragment↔Custom), this holds the
  // path the switch landed on, so the freshly-rendered node auto-opens its
  // picker. Consumed and cleared once by that node (see `useCommon`).
  const justSwitchedTo = useRef<string | null>(null)

  // The path of the node currently being edited via its DisplayBar pencil (set
  // in `useCommon`). It selects the "toolbar" variant of that node's definition
  // (`showOnEdit: true`); every other node — including one opened via the
  // generic edit-tools pencil — falls through to the default variant
  // (`showOnEdit: false`), which gives the raw-JSON editor.
  const [displayBarEditPath, setDisplayBarEditPath] = useState<string | null>(null)

  // Deeper nodes don't have access to higher-level alias definitions when
  // evaluating them on their own (only when evaluated from above), so we
  // collect all top-level aliases and pass them down to all child components
  // (Limitation: aliases defined part-way down the tree, i.e. lower than the
  // root, but higher than where they're used, won't be picked up for evaluation
  // at the inner nodes. But this is not a common scenario, and isn't a big deal
  // for the editor)
  // `getAliases` allocates a fresh object each render, and `expression` changes
  // identity on every commit. Stabilise the *identity* with a dequal guard so
  // the reference only changes when the alias content actually changes —
  // otherwise it would churn `customNodeDefinitions` on every edit. Safe to
  // write a ref during render here: `topLevelAliases` is read only at evaluate
  // time (never during render), so there is no value to tear.
  const nextAliases = getAliases(expression, allNonAliases)
  const aliasesRef = useRef(nextAliases)
  if (!dequal(aliasesRef.current, nextAliases)) aliasesRef.current = nextAliases
  const topLevelAliases = aliasesRef.current

  // This effect is just for when the expression is changed by the parent
  // component -- we need to re-validate and update the expression if validation
  // has changed it. However, this is unnecessary for most changes to
  // expression, as the `onUpdate` function has already validated before setting
  // the state. So we do an equality check and early return if the data hasn't
  // hasn't changed from its previous value.
  useEffect(() => {
    if (!figTree) return
    if (dequal(previousData.current, expression)) return

    const exp = validateExpression(expression, { operators, fragments, functions })
    previousData.current = exp
    setExpression(exp)
    // Intentionally runs only on `expression` changes (re-validate input from
    // the parent); the other referenced values are stable or would re-trigger
    // this sync effect needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression])

  // Stable identities for the (often inline) consumer callbacks, so
  // `evaluateNode` below doesn't change identity on every render.
  const onEvaluateStable = useStableCallback(onEvaluate)
  const onEvaluateStartStable = useStableCallback(onEvaluateStart)
  const onEvaluateErrorStable = useStableCallback(onEvaluateError)

  const evaluateNode = useCallback(
    async (expression: EvaluatorNode, e: React.MouseEvent) => {
      onEvaluateStartStable && onEvaluateStartStable()
      try {
        const result = await figTree.evaluate(expression, { data: objectData })
        onEvaluateStable?.(result, e)
      } catch (err) {
        if (isFigTreeError(err)) console.error(err.prettyPrint)
        onEvaluateErrorStable && onEvaluateErrorStable(err)
      }
    },
    [figTree, objectData, onEvaluateStable, onEvaluateStartStable, onEvaluateErrorStable]
  )

  const isShorthandNodeCollection = useCallback(
    (nodeData: NodeData) =>
      shorthandWithCollectionTester(nodeData, allOpAliases, allFragments, allFunctions),
    [allOpAliases, allFragments, allFunctions]
  )
  const isShorthandNodeWithSimpleValue = useCallback(
    (nodeData: NodeData) =>
      shorthandSimpleNodeTester(nodeData, allOpAliases, allFragments, allFunctions),
    [allOpAliases, allFragments, allFunctions]
  )
  const isShorthandNode = useCallback(
    (nodeData: NodeData) => shorthandNodeTester(nodeData, allOpAliases, allFragments, allFunctions),
    [allOpAliases, allFragments, allFunctions]
  )

  const toShorthand = useCallback(
    (expression: EvaluatorNode) => convertToShorthand(expression, figTree),
    [figTree]
  )
  const fromShorthand = useCallback(
    (expression: EvaluatorNode) => convertFromShorthand(expression, figTree),
    [figTree]
  )
  const toV2 = useCallback(
    (expression: EvaluatorNode) => convertV1ToV2(expression, figTree),
    [figTree]
  )

  const converters = useMemo(
    () => ({ toShorthand, fromShorthand, toV2 }),
    [toShorthand, fromShorthand, toV2]
  )

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
        })
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

  // Shared props for the Operator/Fragment/CustomOperator node components.
  const nodeComponentProps = useMemo(
    () => ({
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
      justSwitchedTo,
      displayBarEditPath,
      setDisplayBarEditPath,
    }),
    [
      figTreeData,
      evaluateNode,
      operatorDisplay,
      topLevelAliases,
      converters,
      addTopLevelFallback,
      updateExpression,
      defaultNewOperatorExpression,
      defaultFragment,
      defaultNewCustomOperator,
      justSwitchedTo,
      displayBarEditPath,
      setDisplayBarEditPath,
    ]
  )

  const customText = useMemo<CustomTextDefinitions>(
    () => ({
      ITEMS_MULTIPLE: (nodeData) =>
        propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
      ITEM_SINGLE: (nodeData) =>
        propertyCountReplace(nodeData, allOpAliases, allFragments, allFunctions),
    }),
    [allOpAliases, allFragments, allFunctions]
  )

  const theme = useMemo<ThemeInput>(
    () => [
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
          if (!(
            isObject(value) &&
            ('operator' in value || 'fragment' in value || isShorthandNodeWithSimpleValue(nodeData))
          ))
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
    ],
    [styles, isShorthandNodeWithSimpleValue]
  )

  // fig-tree's `isOperatorNode` guard tests a node's value; wrap it as a
  // NodeData predicate so it composes with the filter helpers. An operator node
  // whose name is a registered custom function uses the dedicated
  // CustomOperator component; all other operators use the standard Operator
  // component.
  //
  // Each operator/fragment/custom-operator node is registered as a PAIR of
  // definitions:
  //  - a "toolbar" variant (`showOnEdit: true`) that matches ONLY while this
  //    exact node is being edited via its DisplayBar pencil (path match), so
  //    editing renders our structured toolbar; and
  //  - a default variant (`showOnEdit: false`) for every other case, so the
  //    generic edit-tools pencil opens json-edit-react's raw-JSON editor. The
  //    per-node path match is what lets both editors coexist without a flicker.
  //    Type-selector identity (`name`/`defaultValue`/`showInTypeSelector`)
  //    lives only on the default variant, so the type selector lists each type
  //    once.
  const customNodeDefinitions = useMemo<CustomNodeDefinition[]>(() => {
    const isOperator: FilterPredicate = ({ value }) => isOperatorNode(value as EvaluatorNode)
    const isCustomFunctionNode = and(isOperator, ({ value }) =>
      allFunctions.has(String((value as OperatorNode).operator))
    )

    const editVariants = (def: CustomNodeDefinition): CustomNodeDefinition[] => {
      const { condition, name, defaultValue, showInTypeSelector, ...shared } = def
      return [
        {
          ...shared,
          condition: and(condition, ({ path }) => toPathString(path) === displayBarEditPath),
          showOnEdit: true,
        },
        { ...shared, condition, name, defaultValue, showInTypeSelector, showOnEdit: false },
      ]
    }

    return [
      // Operator / Fragment / CustomOperator are anchored on the OBJECT
      // (stable path), and each expands to a toolbar + default variant pair
      // (see `editVariants`) so the DisplayBar pencil opens the structured
      // toolbar while the edit-tools pencil opens the raw-JSON editor.
      ...editVariants({
        condition: isCustomFunctionNode,
        component: CustomOperator as unknown as CustomNodeDefinition['component'],
        componentProps: nodeComponentProps,
        showEditTools: true,
        showInTypeSelector: true,
      }),
      ...editVariants({
        condition: and(isOperator, not(isCustomFunctionNode)),
        component: Operator as unknown as CustomNodeDefinition['component'],
        name: 'Operator',
        componentProps: nodeComponentProps,
        showEditTools: true,
        showInTypeSelector: true,
        defaultValue: defaultNewOperatorExpression ?? { operator: '+', values: [2, 2] },
      }),
      ...editVariants({
        condition: ({ value }) => isFragmentNode(value as EvaluatorNode),
        component: Fragment as unknown as CustomNodeDefinition['component'],
        name: 'Fragment',
        componentProps: nodeComponentProps,
        showEditTools: true,
        showInTypeSelector: true,
        defaultValue: defaultFragment ? { fragment: defaultFragment } : null,
      }),
      {
        condition: (nodeData) => isShorthandNodeCollection(nodeData),
        showKey: false,
        wrapperComponent: ShorthandNodeCollection as unknown as CustomNodeDefinition['component'],
        wrapperProps: {
          figTree,
          evaluateNode,
          topLevelAliases,
          figTreeData,
          converters,
          updateExpression,
        },
      },
      {
        condition: (nodeData) =>
          isFirstAliasNode(nodeData, allOpAliases, allFragments, allFunctions),
        showOnEdit: true,
        wrapperComponent: ({ children }) => (
          <div>
            <p className="ft-alias-header-text">
              <strong>Alias definitions:</strong>
            </p>
            {children}
          </div>
        ),
      },
      {
        condition: (nodeData) =>
          isShorthandNodeWithSimpleValue(nodeData) &&
          !isCollection(Object.values(nodeData.value ?? {})[0]),
        component: ShorthandNodeWithSimpleValue as unknown as CustomNodeDefinition['component'],
        componentProps: {
          figTree,
          figTreeData,
          evaluateNode,
          operatorDisplay,
          topLevelAliases,
          converters,
          updateExpression,
        },
        showEditTools: true,
      },
      {
        condition: and(root, collections),
        component: TopLevelContainer as unknown as CustomNodeDefinition['component'],
        componentProps: {
          figTree,
          figTreeData,
          evaluateNode,
          isShorthandNode,
        },
      },
    ]
  }, [
    nodeComponentProps,
    displayBarEditPath,
    allFunctions,
    allOpAliases,
    allFragments,
    defaultNewOperatorExpression,
    defaultFragment,
    figTree,
    figTreeData,
    evaluateNode,
    topLevelAliases,
    converters,
    updateExpression,
    operatorDisplay,
    isShorthandNodeCollection,
    isShorthandNodeWithSimpleValue,
    isShorthandNode,
  ])

  // Defensive guard, placed after every hook so hook order stays stable.
  if (!figTree) return null

  return (
    <JsonEditor
      // collapseAnimationTime={1000}
      className="ft-editor"
      showCollectionCount="when-collapsed"
      data={expression}
      onUpdate={({ newData, ...rest }, control) => {
        try {
          const validated = validateExpression(newData, {
            operators,
            fragments,
            functions,
          })
          void onUpdate({ newData: validated, ...rest }, control)
          previousData.current = validated
          return { data: validated }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      }}
      allowDelete={(nodeData) => {
        const { key, parentData } = nodeData

        // Respect any caller-supplied allowDelete first (deny short-circuits)
        if (allowDelete === false) return false
        if (typeof allowDelete === 'function' && allowDelete(nodeData) === false) return false

        // The root node can't be deleted
        if (root(nodeData)) return false

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
      setData={setExpression}
      theme={theme}
      customNodeDefinitions={customNodeDefinitions}
      customText={customText}
    />
  )
}

export default FigTreeEditor
