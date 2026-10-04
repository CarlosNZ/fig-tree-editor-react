import React, { Dispatch, useEffect, useState } from 'react'
import JSON5 from 'json5'
import {
  Box,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalFooter,
  ModalOverlay,
  Button,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Textarea,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
  Checkbox,
  HStack,
  VStack,
  useToast,
} from '@chakra-ui/react'
import { filterObjectRecursive } from './helpers'
import {
  cacheStore,
  figTree,
  setCaching,
  usesCache,
  type DemoOptions,
  type OperatorDefaults,
} from './figTree'
import { fragmentsRestrictions } from './fragmentDefinitions'
import { operatorDefaultsRestrictions } from './operatorDefaults'
import { JsonEditor, type ThemeInput } from 'json-edit-react'
import { type FragmentDefinition } from 'fig-tree-evaluator'

// The JSON editors carry no box of their own, and show their root key as a
// label
const jsonEditorTheme = (
  rootKey: React.CSSProperties,
  container: React.CSSProperties
): ThemeInput => ({
  styles: {
    container: { backgroundColor: 'transparent', boxShadow: 'none', padding: 0, ...container },
    property: ({ level }) =>
      level === 0
        ? { fontFamily: 'Work Sans, sans-serif', marginRight: '0.5em', ...rootKey }
        : undefined,
  },
})

// Headers, indented under the fields above them
const headersTheme = jsonEditorTheme({ fontSize: 12 }, { marginTop: 0, marginLeft: '1em' })

// A section of its own, with its name as the heading
const sectionTheme = jsonEditorTheme(
  { fontSize: 14, fontWeight: 'bold' },
  { marginBottom: '0.5em' }
)

const resetFormState = (options: DemoOptions) => {
  const headers = { ...options.http?.headers }
  const authHeader = headers.Authorization
  const gqlHeaders = { ...options.graphQL?.headers }
  const gqlAuth = gqlHeaders.Authorization
  delete headers.Authorization
  delete gqlHeaders.Authorization
  return {
    baseEndpoint: options.http?.baseEndpoint,
    authHeader,
    headers,
    gqlEndpoint: options.graphQL?.endpoint,
    gqlAuth,
    gqlHeaders,
    strictDataPaths: options.strictDataPaths ?? false,
    fragments: options.fragments,
    operatorDefaults: options.operatorDefaults ?? {},
    maxCacheSize: options.cache?.maxSize,
    maxCacheTime: options.cache?.maxTime,
    timeout: options.timeout,
    maxDepth: options.maxDepth,
    maxNodes: options.maxNodes,
  }
}

// An empty field is no limit
const toLimit = (text: string) => (text.trim() === '' ? undefined : Number(text))

export const OptionsModal = ({
  options,
  onSave,
  modalState: { modalOpen, setModalOpen },
}: {
  options: DemoOptions
  // Throws on invalid options
  onSave: (options: DemoOptions) => void
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [formState, setFormState] = useState(resetFormState(options))
  const [cacheSize, setCacheSize] = useState(0)
  const toast = useToast()

  useEffect(() => {
    if (modalOpen) {
      setFormState(resetFormState(options))
      setCacheSize(cacheStore.size)
    }
  }, [modalOpen, options])

  // Empties the cache at once, without waiting for Save
  const clearCache = () => {
    figTree.clearCache()
    setCacheSize(cacheStore.size)
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const {
      baseEndpoint,
      authHeader,
      headers,
      gqlEndpoint,
      gqlAuth,
      gqlHeaders,
      strictDataPaths,
      fragments,
      operatorDefaults,
      maxCacheSize,
      maxCacheTime,
      timeout,
      maxDepth,
      maxNodes,
    } = formState

    const newOptions: DemoOptions = {
      ...filterObjectRecursive({
        http: { baseEndpoint, headers: { Authorization: authHeader, ...headers } },
        graphQL: { endpoint: gqlEndpoint, headers: { Authorization: gqlAuth, ...gqlHeaders } },
        strictDataPaths,
        cache: { maxSize: maxCacheSize, maxTime: maxCacheTime },
        timeout,
        maxDepth,
        maxNodes,
      }),
      fragments,
      // Unfiltered, since `fallback: null` is a default
      operatorDefaults,
    }

    // FigTree checks the options, the fragment definitions included, as they're
    // applied
    try {
      onSave(newOptions)
    } catch (err) {
      toast({
        title: 'Invalid configuration',
        description: err instanceof Error ? err.message : String(err),
        status: 'error',
        duration: 15000,
        isClosable: true,
      })
      return
    }

    setModalOpen(false)
  }

  const labelStyles = { fontSize: 'sm', mb: 0 }

  return (
    <Box>
      <Modal
        size="xl"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent ml={5} mr={5}>
          <ModalHeader pb={0}>Evaluator Configuration</ModalHeader>
          <ModalCloseButton />
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <Stack spacing={2}>
                <FormControl id="base-endpoint">
                  <FormLabel {...labelStyles}>Base endpoint:</FormLabel>
                  <Input
                    value={formState.baseEndpoint}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, baseEndpoint: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="auth-token">
                  <FormLabel {...labelStyles}>{'Authorization (eg Bearer <JWT>)'}:</FormLabel>
                  <Textarea
                    fontSize="xs"
                    value={formState.authHeader}
                    onChange={(e) =>
                      setFormState((curr) => ({ ...curr, authHeader: e.target.value }))
                    }
                  />
                </FormControl>
                <FormControl id="headers">
                  <JsonEditor
                    data={formState.headers ?? {}}
                    setData={(data) =>
                      setFormState({
                        ...formState,
                        headers: data as Record<string, string>,
                      })
                    }
                    collapse={Object.keys(formState.headers).length > 0 ? 1 : 0}
                    rootName="Other HTTP headers"
                    baseFontSize={12}
                    maxWidth="80vw"
                    theme={headersTheme}
                    showCollectionCount="when-collapsed"
                    jsonParse={JSON5.parse}
                  />
                </FormControl>
                <Accordion allowToggle mt={2}>
                  <AccordionItem>
                    <AccordionButton pl={0}>
                      <Box flex="1" textAlign="left">
                        <Text>
                          <strong>GraphQL</strong> (if different from above)
                        </Text>
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pt={0} px={0}>
                      <Stack spacing={2}>
                        <FormControl id="gql-endpoint">
                          <FormLabel {...labelStyles}>Endpoint:</FormLabel>
                          <Input
                            value={formState.gqlEndpoint}
                            onChange={(e) =>
                              setFormState((curr) => ({ ...curr, gqlEndpoint: e.target.value }))
                            }
                          />
                        </FormControl>
                        <FormControl id="gql-auth-token">
                          <FormLabel {...labelStyles}>{'Authorization'}:</FormLabel>
                          <Textarea
                            fontSize="xs"
                            value={formState.gqlAuth}
                            onChange={(e) =>
                              setFormState((curr) => ({ ...curr, gqlAuth: e.target.value }))
                            }
                          />
                        </FormControl>
                        <FormControl id="gql-headers">
                          <JsonEditor
                            data={formState.gqlHeaders ?? {}}
                            setData={(data) =>
                              setFormState({
                                ...formState,
                                gqlHeaders: data as Record<string, string>,
                              })
                            }
                            collapse={Object.keys(formState.gqlHeaders).length > 0 ? 1 : 0}
                            rootName="Other headers"
                            baseFontSize={12}
                            maxWidth="80vw"
                            theme={headersTheme}
                            showCollectionCount="when-collapsed"
                            jsonParse={JSON5.parse}
                          />
                        </FormControl>
                      </Stack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                <FormControl id="fragments">
                  <JsonEditor
                    data={formState.fragments ?? {}}
                    setData={(data) =>
                      setFormState({
                        ...formState,
                        fragments: data as Record<string, FragmentDefinition>,
                      })
                    }
                    collapse={0}
                    rootName="Fragments"
                    {...fragmentsRestrictions}
                    baseFontSize={12}
                    maxWidth="80vw"
                    theme={sectionTheme}
                    showCollectionCount="when-collapsed"
                    jsonParse={JSON5.parse}
                  />
                </FormControl>
                <FormControl id="operator-defaults">
                  <JsonEditor
                    data={formState.operatorDefaults}
                    setData={(data) =>
                      setFormState({
                        ...formState,
                        operatorDefaults: data as OperatorDefaults,
                      })
                    }
                    collapse={0}
                    rootName="Operator defaults"
                    {...operatorDefaultsRestrictions}
                    baseFontSize={12}
                    maxWidth="80vw"
                    theme={sectionTheme}
                    showCollectionCount="when-collapsed"
                    jsonParse={JSON5.parse}
                  />
                </FormControl>
                <hr />
                <VStack align="flex-start" gap={0} mt={1} mb={3}>
                  <Text fontSize="md">
                    <strong>Cache:</strong>
                  </Text>
                  <HStack alignItems="flex-end" mt={-2}>
                    <FormControl id="cache-toggle" flexBasis="60%">
                      {/* A shortcut for the operator defaults' `noCache` */}
                      <Checkbox
                        isChecked={usesCache(formState)}
                        onChange={(_) =>
                          setFormState((curr) => ({
                            ...curr,
                            operatorDefaults: setCaching(curr.operatorDefaults, !usesCache(curr)),
                          }))
                        }
                        colorScheme="green"
                      >
                        <Text {...labelStyles}>Use cache?</Text>
                      </Checkbox>
                    </FormControl>
                    <FormControl id="cache-size">
                      <FormLabel {...labelStyles}>Size</FormLabel>
                      <Input
                        size="sm"
                        value={formState.maxCacheSize}
                        onChange={(e) =>
                          setFormState((curr) => ({
                            ...curr,
                            maxCacheSize: Number(e.target.value),
                          }))
                        }
                      />
                    </FormControl>
                    <FormControl id="cache-time">
                      <FormLabel {...labelStyles}>Max time (seconds)</FormLabel>
                      <Input
                        size="sm"
                        value={formState.maxCacheTime}
                        onChange={(e) =>
                          setFormState((curr) => ({
                            ...curr,
                            maxCacheTime: Number(e.target.value),
                          }))
                        }
                      />
                    </FormControl>
                  </HStack>
                  <HStack mt={2}>
                    <Text {...labelStyles}>
                      {cacheSize} {cacheSize === 1 ? 'entry' : 'entries'} cached
                    </Text>
                    <Button
                      size="xs"
                      colorScheme="green"
                      onClick={clearCache}
                      isDisabled={cacheSize === 0}
                    >
                      Clear cache
                    </Button>
                  </HStack>
                </VStack>
                <hr />
                <Text fontSize="md">
                  <strong>Miscellaneous:</strong>
                </Text>
                <FormControl id="strict-data-paths">
                  <Checkbox
                    isChecked={formState.strictDataPaths}
                    onChange={(_) =>
                      setFormState((curr) => ({
                        ...curr,
                        strictDataPaths: !formState.strictDataPaths,
                      }))
                    }
                    colorScheme="green"
                  >
                    <Text fontSize="sm">Strict data paths (a missing path is an error)</Text>
                  </Checkbox>
                </FormControl>
                <Accordion allowToggle mt={2}>
                  <AccordionItem>
                    <AccordionButton pl={0}>
                      <Box flex="1" textAlign="left">
                        <Text>
                          <strong>Limits</strong> (none if empty)
                        </Text>
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pt={0} px={0}>
                      <HStack alignItems="flex-end">
                        <FormControl id="timeout">
                          <FormLabel {...labelStyles}>Timeout (ms)</FormLabel>
                          <Input
                            size="sm"
                            value={formState.timeout ?? ''}
                            onChange={(e) =>
                              setFormState((curr) => ({
                                ...curr,
                                timeout: toLimit(e.target.value),
                              }))
                            }
                          />
                        </FormControl>
                        <FormControl id="max-depth">
                          <FormLabel {...labelStyles}>Max depth</FormLabel>
                          <Input
                            size="sm"
                            value={formState.maxDepth ?? ''}
                            onChange={(e) =>
                              setFormState((curr) => ({
                                ...curr,
                                maxDepth: toLimit(e.target.value),
                              }))
                            }
                          />
                        </FormControl>
                        <FormControl id="max-nodes">
                          <FormLabel {...labelStyles}>Max nodes</FormLabel>
                          <Input
                            size="sm"
                            value={formState.maxNodes ?? ''}
                            onChange={(e) =>
                              setFormState((curr) => ({
                                ...curr,
                                maxNodes: toLimit(e.target.value),
                              }))
                            }
                          />
                        </FormControl>
                      </HStack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="green" mr={3} type="submit" onClick={handleSubmit}>
                Save
              </Button>
            </ModalFooter>{' '}
          </form>
        </ModalContent>
      </Modal>
    </Box>
  )
}
