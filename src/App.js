import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios';
import base64 from 'base-64';

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex as toHex } from '@noble/hashes/utils';
import b58c from 'bs58check';

import 'antd/dist/reset.css';
import './App.css';

import { Button, Card, Divider, Image, Input, Layout, Progress, Select, Space, Typography, Row, Col  } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import useLocalStorage from './useLocalStorage';
const { Paragraph, Title } = Typography;
const { Content, Footer } = Layout;


function concatUint8Arrays(a, b) {
  var c = new Uint8Array(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}

function generateKey() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv);
  // NB: The first byte is the 'type', i.e. 0 is for addresses
  const addr = b58c.encode(concatUint8Arrays(Uint8Array.from([0]), ripemd160(sha256(pub))));
  return [toHex(priv), toHex(pub), addr];
}

function formatKeys([pub, priv, addr, bal]) {
  return (
    <Paragraph>
      {/* <Paragraph>Public key: {pub}</Paragraph> */}
      Private key: <pre>{priv}</pre>
      Address: <pre>{addr}</pre>
    </Paragraph>
  );
}

function logKeys([pub, priv, addr, bal]) {
  console.log('Public key:', pub);
  console.log('Private key:', priv);
  console.log('Address:', addr);
  console.log('Balance:', bal);
  console.log('---------------------');
}

const bitcoinGenesisAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';


const apis = {
  'covalenthq.com': {
    free: false,
    axiosGet: ({ addr, apiKey }) => (
      axios.get(`https://api.covalenthq.com/v1/btc-mainnet/address/${addr}/balances_v2/`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + base64.encode(`${apiKey}:`)
        }
      })),
    extractBalance: (res) => (res.data.data.items.reduce((a, x) => (x.balance+a), 0) / (10**8)),
    errorInfo: 'Please check if the API key is correct (should start with "ckey_") and if you have enough requests left.',
  },
  'blockstream.info': {
    free: true,
    axiosGet: ({ addr }) => (axios.get(`https://blockstream.info/api/address/${addr}`)),
    extractBalance: (res) => ((res.data.chain_stats.funded_txo_sum - res.data.chain_stats.spent_txo_sum) / 10**8),
    errorInfo: 'The free provider might be blocking your requests. Try using a free API key from "covalenthq.com"'
  },
  'blockchain.info': {
    free: true,
    axiosGet: ({ addr }) => (axios.get(`https://blockchain.info/rawaddr/${addr}`)),
    extractBalance: (res) => (res.data.final_balance / 10**8),
    errorInfo: 'The free provider might be blocking your requests. Try using a free API key from "covalenthq.com"'
  }
}


export default function App() {
  const [apiKey, setApiKey] = useLocalStorage('');

  const [keyCount, setKeyCount] = useState(1);
  const [loading, setLoading] = useState(false);

  const [apiWorks, setApiWorks] = useState(false);
  const [results, setResults] = useState([]);
  const [resultTexts, setResultTexts] = useState([]);

  // Can check if the API works by fetching the genesis address and checking if it has a balance
  const fetchNextKey = useCallback((check=false) => {
    const [priv, pub, addr] = check ? ['', '', bitcoinGenesisAddress] : generateKey();
    const api = !apiKey ? apis['blockchain.info'] : apis['covalenthq.com'];
    
    api.axiosGet({ addr, apiKey })
      .then((res) => {
        if (res.data) {
          const bal = api.extractBalance(res);
          if (!check) {
            logKeys([priv, pub, addr, bal]);
            setResults(current => [
              ...current,
              [priv, pub, addr, bal]
            ]);
          }
          if (check && bal > 0) {
            setApiWorks(true);
          }
          if (check && bal === 0) {
            setApiWorks(false);
            setResultTexts([
              'Error: The API does not deliver correct balance results.',
            ]);
            setLoading(false);
          }
        }
      })
      .catch((err) => {
        setResultTexts([
          'Error: Something went wrong.',
          api.errorInfo
        ]);
        console.log('Error:', err);
        setLoading(false);
      });
  }, [apiKey]);

  const onSubmit = (values) => {
    setResults([]);
    setResultTexts([]);
    setLoading(true);
  };

  useEffect(() => {
    if (loading && !apiWorks) {
      // Do check run with genesis address first
      setTimeout(fetchNextKey(true), 300);
    }
    if (loading && apiWorks && results.length < keyCount) {
      setTimeout(fetchNextKey, 300);
    }
  }, [loading, apiWorks, fetchNextKey, results, keyCount]);

  useEffect(() => {
    const highestBalance = results.reduce((acc, curr) => Math.max(acc, curr[3]), 0);
    if (results.length > 0) {
      setResultTexts([
        `API check succeeded. Now generating keys.`,
        `You have generated ${results.length} keys so far.`
      ].concat((highestBalance > 0)
        ? [
          `Congratulations! You have won the lottery! You gain ${highestBalance} BTC.`,
          formatKeys(results.find((r) => r[3] === highestBalance))
        ]
        : [`Unfortunately, all keys had 0 balance.`]
      ));
    }
    if (results.length === keyCount) {
      setLoading(false);
    }
  }, [results, keyCount]);

  const explainers = [
    `The lottery is no-risk gamble based on Bitcoin.
    Generate some random wallets and check the balance! (Details see below)`,
    `This uses "blockchain.info" to query the balance of the generated addresses.`,
    `To reduce the risk of getting blocked, create a free account at "covalenthq.com" and paste your API key here.`,
    `Good luck!`
  ]

  const disclaimers = [
    `There are 2^256 private bitcoin keys (i.e. wallets, sort of) in total, which is a number with 77 digits.
    Estimations suggest that a couple hundred million of them are in use,
    meaning the chance of guessing one with a non-zero balance is around 1 in 10^69.`,
    `You can further improve chances by trying multiple keys at once.
    However, your browser will be querying "blockhain.info" for balances of the accounts, so don't get blocked ;)`,
    `Also, if you do actually win, the prize is just the account of another person or entity. Be aware.`,
    `This web-app stores no information online about you, the generated keys, the api key, your behaviour, etc.
    For convenience, the api key is stored in your browser's local storage.`
  ]

  return (
    <Layout className='App'>
      <Content className='App-content'>
        <Card
          title={<Title level={2} style={{ margin: '0.5em' }}>The <span style={{ color: '#57cbcc' }}>Lottery</span></Title>}
          style={{ maxWidth: '700px', width: '100%' }}>
          <Row align='middle'>
            <Col sm={24} md={12}>
              {explainers.map((explainer, i) => (<Paragraph style={{ textAlign: 'left' }} key={`explainer${i}`}>{explainer}</Paragraph>))}
            </Col>
            <Col sm={24} md={12}>
              <Space direction='vertical' style={{ width: '100%'}}>
                <Input
                  placeholder='Optional: Covalent API key ckey_...'
                  value={apiKey} prefix={<KeyOutlined />}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={loading} />
                <Space.Compact block>
                  <Select
                    defaultValue={1}
                    style={{ width: '100%' }}
                    onChange={(value) => setKeyCount(value)}
                    options={[
                      { value: 1, label: '1 Key' },
                      { value: 10, label: '10 Keys' },
                      { value: 100, label: '100 Keys' },
                      { value: 1000, label: '1000 Keys' },
                    ]}
                    disabled={loading}
                  />
                  <Button block type='primary' disabled={loading} loading={loading} onClick={onSubmit}>Go!</Button>
                </Space.Compact>
              </Space>
            </Col>
          </Row>
          <Divider />
          {!!results.length && (<>
            <Progress percent={results.length / keyCount *100} showInfo={false} />
            {resultTexts.map((resultText, i) => (<Paragraph style={{ textAlign: 'left' }} key={`result${i}`}>{resultText}</Paragraph>))}
            <Divider />
          </>)}
          {disclaimers.map((disclaimer, i) => (
            <Paragraph style={{ textAlign: 'left', fontSize: '0.7em', color: 'darkgray' }} key={`disclaimer${i}`}>
              {disclaimer}
            </Paragraph>))}
        </Card>
      </Content>
      <Footer style={{ textAlign: 'right', background: 'none' }}>
        <a href='https://altura.ai'>
          <Image src='/altura_pic_name_dark_transparent.png' height='30px' preview={false} />
        </a>
      </Footer>
    </Layout>
  );
}