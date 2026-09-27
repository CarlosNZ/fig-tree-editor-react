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
import { buildFigTree, type DemoOptions } from './figTree'
import { JsonEditor } from 'json-edit-react'
import { type FragmentDefinition } from 'fig-tree-evaluator'

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
    runtimeTypeCheck: options.runtimeTypeCheck ?? true,
    strictDataPaths: options.strictDataPaths ?? false,
    fragments: options.fragments,
    useCache: options.useCache ?? true,
    maxCacheSize: options.cache?.maxSize,
    maxCacheTime: options.cache?.maxTime,
  }
}

export const OptionsModal = ({
  options,
  onSave,
  modalState: { modalOpen, setModalOpen },
}: {
  options: DemoOptions
  onSave: (options: DemoOptions) => void
  modalState: { modalOpen: boolean; setModalOpen: Dispatch<React.SetStateAction<boolean>> }
}) => {
  const [formState, setFormState] = useState(resetFormState(options))
  const toast = useToast()

  useEffect(() => {
    if (modalOpen) {
      setFormState(resetFormState(options))
    }
  }, [modalOpen, options])

  const handleSubmit = (e: any) => {
    e.preventDefault()
    const {
      baseEndpoint,
      authHeader,
      headers,
      gqlEndpoint,
      gqlAuth,
      gqlHeaders,
      runtimeTypeCheck,
      strictDataPaths,
      fragments,
      useCache,
      maxCacheSize,
      maxCacheTime,
    } = formState

    const newOptions: DemoOptions = {
      ...filterObjectRecursive({
        http: { baseEndpoint, headers: { Authorization: authHeader, ...headers } },
        graphQL: { endpoint: gqlEndpoint, headers: { Authorization: gqlAuth, ...gqlHeaders } },
        runtimeTypeCheck,
        strictDataPaths,
        useCache,
        cache: { maxSize: maxCacheSize, maxTime: maxCacheTime },
      }),
      fragments,
    }

    // FigTree checks the options, the fragment definitions included, when it's
    // constructed
    try {
      buildFigTree(newOptions)
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

    onSave(newOptions)
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
                    theme={{
                      styles: {
                        container: {
                          backgroundColor: 'transparent',
                          boxShadow: 'none',
                          padding: 0,
                          marginTop: 0,
                          marginLeft: '1em',
                        },
                        property: ({ level }) => {
                          if (level === 0)
                            return {
                              fontSize: 12,
                              fontFamily: 'Work Sans, sans-serif',
                              marginRight: '0.5em',
                              // fontWeight: 'bold',
                            }
                        },
                      },
                    }}
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
                            theme={{
                              styles: {
                                container: {
                                  backgroundColor: 'transparent',
                                  boxShadow: 'none',
                                  padding: 0,
                                  // marginTop: 0,
                                  marginLeft: '1em',
                                },
                                property: ({ level }) => {
                                  if (level === 0)
                                    return {
                                      fontSize: 12,
                                      fontFamily: 'Work Sans, sans-serif',
                                      marginRight: '0.5em',
                                    }
                                },
                              },
                            }}
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
                    baseFontSize={12}
                    maxWidth="80vw"
                    theme={{
                      styles: {
                        container: {
                          backgroundColor: 'transparent',
                          boxShadow: 'none',
                          padding: 0,
                          marginBottom: '0.5em',
                        },
                        property: ({ level }) => {
                          if (level === 0)
                            return {
                              fontSize: 14,
                              fontFamily: 'Work Sans, sans-serif',
                              marginRight: '0.5em',
                              fontWeight: 'bold',
                            }
                        },
                      },
                    }}
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
                      <Checkbox
                        isChecked={formState.useCache}
                        onChange={(_) =>
                          setFormState((curr) => ({
                            ...curr,
                            useCache: !formState.useCache,
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
                </VStack>
                <hr />
                <Text fontSize="md">
                  <strong>Miscellaneous:</strong>
                </Text>
                <FormControl id="runtime-type-check">
                  <Checkbox
                    isChecked={formState.runtimeTypeCheck}
                    onChange={(_) =>
                      setFormState((curr) => ({
                        ...curr,
                        runtimeTypeCheck: !formState.runtimeTypeCheck,
                      }))
                    }
                    colorScheme="green"
                  >
                    <Text fontSize="sm">Runtime type checking</Text>
                  </Checkbox>
                </FormControl>
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
