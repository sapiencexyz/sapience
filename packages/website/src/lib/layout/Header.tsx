import { ChatIcon } from '@chakra-ui/icons';
import { Button, Flex, Image } from '@chakra-ui/react';

const Header = () => {
  return (
    <Flex
      as="header"
      width="full"
      align="center"
      p={3}
      zIndex={3}
      position="fixed"
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
    >
      <Image src="/logo.svg" alt="Foil" height="28px" />
      <Button
        px={4}
        size="sm"
        as="a"
        marginLeft="auto"
        colorScheme="blackAlpha"
        bg="black"
        _hover={{ bg: 'blackAlpha.800' }}
        href="mailto:rafa@foil.xyz"
        letterSpacing="0.025rem"
        leftIcon={<ChatIcon />}
      >
        Let’s Chat
      </Button>
    </Flex>
  );
};

export default Header;
