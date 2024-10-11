'use client';

import { Box, Button, Container, Flex, Input, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import { API_BASE_URL } from '~/lib/constants/constants';
import { useLoading } from '~/lib/context/LoadingContext';
import { RenderJob } from '~/lib/interfaces/interfaces';

const Admin = () => {
  const [chainId, setChainId] = useState('');
  const [address, setAddress] = useState('');
  const [job, setJob] = useState<RenderJob | undefined>();
  const [lastRefresh, setLastRefresh] = useState('');

  const { setIsLoading } = useLoading();

  const handleReindex = async () => {
    setIsLoading(true);
    const response = await axios.get(
      `${API_BASE_URL}/reindex?chainId=${chainId}&address=${address}`
    );
    console.log('response', response);
    if (response.data.success && response.data.job) {
      setJob(response.data.job);
    } else {
      setJob(undefined);
    }
    setIsLoading(false);
  };

  const handleGetStatus = async () => {
    if (!job) return;
    setIsLoading(true);
    const response = await axios.get(
      `${API_BASE_URL}/reindexStatus?jobId=${job.id}&serviceId=${job.serviceId}`
    );
    console.log('status response', response);

    if (response.data.success && response.data.job) {
      setJob(response.data.job);
      setLastRefresh(new Date().toISOString());
    }

    console.log('response', response);
    setIsLoading(false);
  };

  const renderJob = () => {
    if (!job) return;
    return (
      <Box my={4}>
        {' '}
        <Text fontWeight={'bold'} fontSize={'lg'}>
          Job Status:
        </Text>
        {Object.entries(job).map(([key, value]) => (
          <Flex justifyContent={'space-between'} key={key}>
            <Text mr={2} fontWeight={'bold'}>
              {key}:
            </Text>
            <Text>{value}</Text>
          </Flex>
        ))}
        <Text>Last Refresh: {lastRefresh}</Text>
      </Box>
    );
  };

  return (
    <Container mb={10}>
      <Text fontSize="xl" my={8} fontWeight={'bold'}>
        Reindex
      </Text>
      <Box mb={4}>
        <Text>Enter Market Address</Text>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Box>
      <Box mb={4}>
        <Text>Enter Chain ID</Text>
        <Input value={chainId} onChange={(e) => setChainId(e.target.value)} />
      </Box>
      <Button onClick={handleReindex}>Submit</Button>
      <Box mt={8}>
        {renderJob()}
        <Box mb={4}>
          <Text>Service Id:</Text>
          <Input value={job?.serviceId || ''} readOnly />
        </Box>
        <Box mb={4}>
          <Text>JobId:</Text>
          <Input value={job?.id || ''} readOnly />
        </Box>
        <Button onClick={handleGetStatus} disabled={!job}>
          {' '}
          refresh job status
        </Button>
      </Box>
    </Container>
  );
};

export default Admin;
