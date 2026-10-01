import { useMemo, useRef, useState } from 'react'
import JSON5 from 'json5'
import './App.css'
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  Select,
  Icon,
  HStack,
  VStack,
  Link,
  useToast,
  Spacer,
  useMediaQuery,
} from '@chakra-ui/react'
import { FaNpm, FaExternalLinkAlt, FaGithub } from 'react-icons/fa'
import { FigTreeEditor, type EditorStatus, type Evaluation } from '@fig-tree-editor-react'
import { version as figTreeVersion } from 'fig-tree-evaluator'
import { OptionsModal } from './OptionsModal'
import { getInitOptions, getLocalStorage, setLocalStorage, truncate } from './helpers'
import { buildFigTree, type DemoOptions } from './figTree'
import { JsonEditor } from 'json-edit-react'
import { demoData, defaultBlurb } from './data'
import { ResultToast } from './ResultToast'
import { useUndo } from './useUndo'
import { InfoModal } from './InfoModal'
import { SourceIndicator } from './SourceIndicator'
import { figTreeEditorReactVersion, timestamp } from './version'

const initData = demoData[0]

console.log(`fig-tree-editor-react v${figTreeEditorReactVersion}`)
console.log('Site built:', timestamp)

// A row's path, as the toasts name it
const describePath = (path: (string | number)[]) =>
  path.length === 0 ? 'Full expression' : path.join('.')

// The editor's status in a line, for watching it by hand
const describeStatus = ({ valid, counts, editing }: EditorStatus) =>
  [
    valid ? 'valid' : 'invalid',
    `${counts.errors} errors`,
    `${counts.warnings} warnings`,
    `${counts.hints} hints`,
    `${counts.filledIn} added`,
    editing ? 'editing' : 'not editing',
  ].join(' · ')

function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isMobile] = useMediaQuery('(max-width: 635px)')
  const [selectedDataIndex, setSelectedDataIndex] = useState<number>(
    demoData.findIndex((data) => data.name === getLocalStorage('lastSelected'))
  )
  const modalContent = useRef('main')
  const [showInfo, setShowInfo] = useState(!getLocalStorage('visited')?.main)
  const [options, setOptions] = useState<DemoOptions>(getInitOptions)
  const figTree = useMemo(() => buildFigTree(options), [options])
  const [status, setStatus] = useState<EditorStatus | null>(null)

  const {
    data: objectData,
    setData: setObjectData,
    UndoRedo: DataUndoRedo,
  } = useUndo(getLocalStorage('objectData') ?? initData.objectData)

  const currentDemoData =
    selectedDataIndex !== undefined ? demoData?.[selectedDataIndex] : undefined

  const jsonEditorOptions = currentDemoData
    ? currentDemoData?.objectJsonEditorProps
    : (getLocalStorage('jsonEditorOptions') ?? {})

  const expressionCollapse = currentDemoData
    ? (currentDemoData?.expressionCollapse ?? 2)
    : (getLocalStorage('expressionCollapse') ?? 2)

  const {
    data: expression,
    setData: setExpression,
    UndoRedo: ExpressionUndoRedo,
  } = useUndo(getLocalStorage('expression') ?? initData.expression)

  const toast = useToast()

  const updateOptions = (newOptions: DemoOptions) => {
    setOptions(newOptions)
    setLocalStorage('options', newOptions)
  }

  // Each evaluation the editor reports, as a toast, the primary result viewer
  //
  // TO-DO: say where a result has one value per element, from a row inside
  // an iterator (plan, 10.7)
  const showEvaluation = ({ path, status, result, failures }: Evaluation) => {
    const where = describePath(path)
    if (status === 'done')
      toast({
        render: ({ onClose }) => (
          <ResultToast
            title={failures.length > 0 ? `${where}, with failures` : where}
            value={result}
            close={onClose}
          />
        ),
        position: 'top',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
    else
      toast({
        title: `${where}: ${status}`,
        description: failures
          .map((failure) => `${describePath(failure.path)}: ${failure.message}`)
          .join('; '),
        position: 'top',
        status: status === 'failed' ? 'error' : 'info',
        duration: status === 'failed' ? 15000 : 3000,
        isClosable: true,
      })
  }

  const handleDemoSelect = (selected: number) => {
    setSelectedDataIndex(selected)
    const visited = getLocalStorage('visited')
    if (!visited?.[demoData?.[selected]?.name]) setShowInfo(true)

    const { objectData, expression, figTreeOptions = {} } = demoData[selected]
    setExpression(expression)
    setLocalStorage('expression', expression)
    if (objectData) {
      setObjectData(objectData)
      setLocalStorage('objectData', objectData)
    }
    setLocalStorage('lastSelected', demoData[selected].name)
    modalContent.current = demoData[selected].name
    updateOptions({ ...options, ...figTreeOptions })
  }

  return (
    <Flex px={1} pt={3} minH="100vh" flexDirection="column" justifyContent="space-between">
      <VStack h="100%" w="100%">
        <OptionsModal
          options={options}
          onSave={updateOptions}
          modalState={{
            modalOpen,
            setModalOpen,
          }}
        />
        <InfoModal
          selected={currentDemoData?.name ?? 'main'}
          content={
            modalContent.current === 'main'
              ? defaultBlurb
              : (currentDemoData?.content ?? defaultBlurb)
          }
          modalState={{
            modalOpen: showInfo,
            closeModal: () => {
              setShowInfo(false)
            },
          }}
        />
        {/** HEADER */}
        <HStack w="100%" px={4} justify="space-between" align="flex-start">
          <VStack align="flex-start" gap={3}>
            <HStack align="flex-end" mt={2} gap={4} flexWrap="wrap">
              <Flex gap={6} align="flex-start">
                <img
                  src="https://raw.githubusercontent.com/CarlosNZ/fig-tree-evaluator/main/images/FigTreeEvaluator_logo_1000.png"
                  alt="logo"
                  style={
                    isMobile
                      ? { maxHeight: '4em' }
                      : { maxHeight: '6em', transform: 'translateY(-10px)' }
                  }
                />
                <Box mb={isMobile ? -2 : 8}>
                  <Heading as="h1" size="2xl" variant="other" mb={2}>
                    fig-tree-evaluator
                  </Heading>
                  {!isMobile && (
                    <Heading variant="sub">
                      A highly configurable custom expression tree evaluator •{' '}
                      <Link
                        href="https://github.com/CarlosNZ/fig-tree-evaluator#readme"
                        isExternal
                        color="accent"
                      >
                        Docs <Icon boxSize={4} as={FaExternalLinkAlt} />
                      </Link>
                    </Heading>
                  )}
                </Box>
              </Flex>
            </HStack>
          </VStack>
          <Flex align="center" gap={5}>
            <a
              href="https://github.com/CarlosNZ/fig-tree-evaluator"
              target="_blank"
              rel="noreferrer"
            >
              <Icon boxSize="2em" as={FaGithub} color="accent" />
            </a>
            <a
              href="https://www.npmjs.com/package/fig-tree-evaluator"
              target="_blank"
              rel="noreferrer"
            >
              <Icon boxSize="3em" as={FaNpm} color="accent" />
            </a>
          </Flex>
        </HStack>
        {isMobile && (
          <Heading px={8} variant="sub" fontSize="110%" mb={4} mt={-2}>
            A highly configurable custom expression tree evaluator •{' '}
            <Link
              href="https://github.com/CarlosNZ/fig-tree-evaluator#readme"
              isExternal
              color="accent"
            >
              Docs <Icon boxSize={4} as={FaExternalLinkAlt} />
            </Link>
          </Heading>
        )}
        {/** DATA COLUMN */}
        <Flex wrap="wrap" h="100%" w="100%" justify="space-around" gap={5} mb={20}>
          <Flex w="45%" direction="column" alignItems="center" flexGrow={1}>
            <Box maxW={500}>
              <Heading size="md" alignSelf="flex-start">
                Application data state
              </Heading>
              <Text>
                This object represents a data structure that is available to{' '}
                <strong>FigTree</strong>. It can be read with <code>$data</code> references, such as{' '}
                <code>"$data.user.firstName"</code>.
              </Text>
            </Box>
            <JsonEditor
              data={objectData}
              setData={setObjectData}
              rootName="data"
              collapse={jsonEditorOptions?.collapse ?? 2}
              onUpdate={(result) => {
                setLocalStorage('objectData', result.newData)
                if (jsonEditorOptions?.onUpdate) return jsonEditorOptions.onUpdate(result)
              }}
              minWidth="50%"
              onCopy={({ stringValue, type }) => {
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncate(String(stringValue)),
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              }}
              showCollectionCount="when-collapsed"
              jsonParse={JSON5.parse}
              {...jsonEditorOptions}
            />
            <Text align="end" w="100%" maxW={600} fontSize="sm" mt={1} pr={1}>
              Powered by{' '}
              <Link href="https://carlosnz.github.io/json-edit-react/" isExternal>
                json-edit-react
              </Link>
            </Text>
            {DataUndoRedo}
          </Flex>
          {/** EXPRESSION EDITOR COLUMN */}
          <Flex h={'100%'} minW="45%" direction="column" alignItems="center" flexGrow={1} mb={10}>
            <Box maxW={500} w="100%">
              <Heading size="md" alignSelf="flex-start">
                FigTree expression
              </Heading>
              <Text>Edit the expression, and click Evaluate to see its result.</Text>
            </Box>
            <FigTreeEditor
              figTree={figTree}
              expression={expression}
              // Saved here rather than in `onUpdate`, which doesn't see the
              // editor's own writes
              setExpression={(newExpression, options) => {
                setExpression(newExpression, options)
                setLocalStorage('expression', newExpression)
              }}
              rootName="expression"
              evaluationData={objectData as Record<string, unknown>}
              onCopy={({ stringValue, type }) =>
                toast({
                  title: `${type === 'value' ? 'Value' : 'Path'} copied to clipboard:`,
                  description: truncate(String(stringValue)),
                  status: 'info',
                  duration: 5000,
                  isClosable: true,
                })
              }
              minWidth="90%"
              stringTruncateLength={500}
              jsonParse={JSON5.parse}
              collapse={expressionCollapse}
              onStatusChange={(newStatus) => {
                console.log('onStatusChange', newStatus)
                setStatus(newStatus)
              }}
              onEvaluateStart={(start) => console.log('onEvaluateStart', start)}
              onEvaluate={(evaluation) => {
                console.log('onEvaluate', evaluation)
                showEvaluation(evaluation)
              }}
            />
            {status && (
              <Text w="100%" maxW={600} fontSize="sm" mt={1} pr={1} color="gray.600">
                Status: {describeStatus(status)}
              </Text>
            )}
            <Text align="end" w="100%" maxW={600} fontSize="sm" mt={1} pr={1}>
              Powered by{' '}
              <Link href="https://github.com/CarlosNZ/fig-tree-editor-react/" isExternal>
                fig-tree-editor-react
              </Link>
            </Text>
            {ExpressionUndoRedo}
          </Flex>
        </Flex>
      </VStack>
      <HStack
        w="100%"
        px={3}
        pos="fixed"
        bottom={0}
        backgroundColor="background"
        boxShadow="rgba(17, 17, 26, 0.1) 0px 4px 16px, rgba(17, 17, 26, 0.1) 0px 8px 24px, rgba(17, 17, 26, 0.1) 0px 16px 56px;"
        flexWrap="wrap"
      >
        <Text color="accent">
          <strong>Experiment with a range of demo expressions:</strong>
        </Text>
        <Select
          variant="filled"
          backgroundColor="gray.50"
          maxW={300}
          onChange={(e) => handleDemoSelect(Number(e.target.value))}
          value={selectedDataIndex === -1 ? 'Select' : selectedDataIndex}
        >
          <option value="Select" disabled={selectedDataIndex !== undefined}>
            Select an option
          </option>
          {demoData.map((data, index) => (
            <option key={data.name} value={index}>
              {data.name}
            </option>
          ))}
        </Select>
        <Button colorScheme="green" onClick={() => setShowInfo(true)}>
          Info
        </Button>
        <Spacer />
        <HStack alignItems="flex-end" p={2}>
          <Text fontSize="xs" mb={1}>
            fig-tree-evaluator v{figTreeVersion}
          </Text>
          <Button colorScheme="green" onClick={() => setModalOpen(true)}>
            Configuration
          </Button>
        </HStack>
      </HStack>
      <SourceIndicator />
    </Flex>
  )
}

export default App
