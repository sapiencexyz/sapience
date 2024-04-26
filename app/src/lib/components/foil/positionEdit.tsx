import { EditIcon } from '@chakra-ui/icons';
import {
  Heading,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useDisclosure,
} from '@chakra-ui/react';

import LiquidityPosition from './liquidityPosition';
import PositionEdit from './positionEdit';
import TraderPosition from './traderPosition';
import { MdKeyboardDoubleArrowRight } from "react-icons/md";


export default function PositionEdit(row: any) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <IconButton size="lg" bg="#f5f7ff" color="#0053ff" icon={<MdKeyboardDoubleArrowRight />} onClick={onOpen} variant="ghost" />
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Position</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Tabs>
              <TabList>
                <Tab>LP</Tab>
                <Tab>Trade</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  <LiquidityPosition />
                </TabPanel>
                <TabPanel>
                  <TraderPosition />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
