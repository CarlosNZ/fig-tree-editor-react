import { useState } from 'react'
import { useUndo as useUndoHook } from '@json-edit-react/utils'
import { Button, HStack, VStack, Spacer } from '@chakra-ui/react'
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons'
import { JsonData } from 'json-edit-react'

export const useUndo = (initialData: JsonData) => {
  // The hook is controlled — we own the live data, it keeps the snapshot stacks.
  const [data, setData] = useState<JsonData>(initialData)
  const { set, replace, undo, redo, canUndo, canRedo } = useUndoHook(data, setData)

  // A write the author didn't make (the editor filling in an expression it
  // was given, marked `autoUpdate`) replaces the current state rather than
  // recording a step, so undo never lands on the incomplete version
  const handleChange = (newData: JsonData, options?: { autoUpdate?: boolean }) => {
    if (JSON.stringify(newData) === JSON.stringify(data)) return
    if (options?.autoUpdate) replace(newData)
    else set(newData)
  }

  const UndoRedo = (
    <VStack w="80%" maxW={500} align="flex-end" gap={4}>
      <HStack w="100%" justify="space-between" mt={4}>
        <Button
          colorScheme="green"
          leftIcon={<ArrowBackIcon />}
          onClick={() => undo()}
          isDisabled={!canUndo}
        >
          Undo
        </Button>
        <Spacer />
        <Button
          colorScheme="green"
          rightIcon={<ArrowForwardIcon />}
          onClick={() => redo()}
          isDisabled={!canRedo}
        >
          Redo
        </Button>
      </HStack>
      {/* <HStack justify="flex-end" w="100%">
        <Button
          color="accent"
          borderColor="accent"
          leftIcon={<BiReset />}
          variant="outline"
          onClick={() => reset(resetPoint)}
          visibility={canUndo ? 'visible' : 'hidden'}
        >
          Reset
        </Button>
      </HStack> */}
    </VStack>
  )

  return {
    data,
    setData: handleChange,
    // reset: externalReset,
    // setResetPoint,
    UndoRedo,
  }
}
