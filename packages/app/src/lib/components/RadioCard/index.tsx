'use client';

import { Box, useRadio } from '@chakra-ui/react';

function RadioCard(props: any) {
  const { getInputProps, getRadioProps } = useRadio(props);

  const input = getInputProps();
  const checkbox = getRadioProps();

  return (
    <Box flex="1" as="label">
      <input {...input} />
      <Box
        {...checkbox}
        textAlign="center"
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="md"
        fontWeight={700}
        _hover={{
          bg: 'gray.100',
        }}
        _checked={{
          cursor: 'normal',
          bg: 'gray.800',
          color: 'white',
          borderColor: 'gray.800',
          boxShadow: 'none',
        }}
        _focus={{
          boxShadow: 'outline',
        }}
        p={2}
      >
        {props.children}
      </Box>
    </Box>
  );
}
export default RadioCard;
