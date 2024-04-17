import { Flex, Image } from '@chakra-ui/react';

const Footer = () => {
  return (
    <Flex as="footer" width="full" justifyContent="center" pt={2}>
      <Image src="/footer.png" height="64px" />
    </Flex>
  );
};

export default Footer;
