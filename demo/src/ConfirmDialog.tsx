import { useRef } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from '@chakra-ui/react'
import { type ConfirmDialogState } from '@json-edit-react/utils'

// The dialog for a question `useJsonEditorConfirm` asks, such as
// `useFragmentEditor`'s before discarding unsaved edits
export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogState) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onCancel}>
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg">{title}</AlertDialogHeader>
          <AlertDialogBody>{message}</AlertDialogBody>
          <AlertDialogFooter gap={3}>
            <Button ref={cancelRef} onClick={onCancel}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={onConfirm}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
