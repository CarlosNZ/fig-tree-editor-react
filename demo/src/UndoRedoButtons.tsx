import { Button, HStack, VStack, Spacer } from '@chakra-ui/react'
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons'

// Undo and Redo, for any history
export const UndoRedoButtons = ({
  undo,
  redo,
  canUndo,
  canRedo,
}: {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}) => (
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
