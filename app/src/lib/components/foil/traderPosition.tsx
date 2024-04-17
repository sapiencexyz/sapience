import {
  Flex,
  FormControl,
  Input,
  InputGroup,
  InputRightAddon,
  Box,
  useRadio,
  useRadioGroup,
  Button,
  InputRightElement,
  FormLabel,
  Text,
} from '@chakra-ui/react';
import { useState } from 'react';

function RadioCard(props) {
  const { getInputProps, getRadioProps } = useRadio(props);

  const input = getInputProps();
  const checkbox = getRadioProps();

  return (
    <Box as="label">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="md"
        _checked={{
          bg: 'teal.600',
          color: 'white',
          borderColor: 'teal.600',
        }}
        _focus={{
          boxShadow: 'outline',
        }}
        px={5}
        py={3}
      >
        {props.children}
      </Box>
    </Box>
  );
}

export default function TraderPosition() {
  const options = ['LONG', 'SHORT'];

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'positionType',
    defaultValue: 'react',
    onChange: console.log,
  });

  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);

  return (
    <form>
      <Flex gap={4} mb={4}>
        {options.map((value) => {
          const radio = getRadioProps({ value });
          return (
            <RadioCard key={value} {...radio}>
              {value}
            </RadioCard>
          );
        })}
      </Flex>
      <FormControl mb={4}>
        <FormLabel>Size</FormLabel>
        <InputGroup>
          <Input type="number" />
          <InputRightElement width="4.5rem">
            <Button h="1.75rem" size="sm" onClick={handleClick}>
              {show ? 'cbETH' : 'Ggas'}
            </Button>
          </InputRightElement>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <InputGroup>
          <Input value="123" readOnly type="number" disabled />
          <InputRightAddon>{show ? 'Ggas' : 'cbETH'}</InputRightAddon>
        </InputGroup>
      </FormControl>
      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb="1">Position: X Ggas -> X Ggas</Text>
        <Text fontSize="sm" color="gray.500" mb="1">Wallet Balance: X cbETH -> x cbETH</Text>
      </Box>
      <Button width="full" colorScheme="green">
        Trade
      </Button>{' '}
    </form>
  );
}
