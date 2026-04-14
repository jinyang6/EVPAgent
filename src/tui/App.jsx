import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Box, Text, useInput, Static } from 'ink';
import { formatStatsReport, resetResponseStats } from '../../system/agents/SearchAgent/tools/stats.mjs';

/**
 * EVPAgent TUI - Simple with Loading
 */
const MAX_MESSAGES = 20;

const LoadingSpinner = () => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(id);
  }, []);
  
  return <Text dimColor>{frames[frame]}</Text>;
};

const App = ({ agent, config, processQuery }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolQuery, setToolQuery] = useState(null);
  const [toolEntries, setToolEntries] = useState([]);
  const [stage, setStage] = useState('idle'); // idle, composing, researching
  const msgIdRef = useRef(0);

  useInput((char, key) => {
    if (key.return) {
      handleSubmit();
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (char) {
      setInput(prev => prev + char);
    }
  });

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    
    const userInput = input.trim();
    setInput('');
    setIsLoading(true);
    setToolQuery(null);
    setToolEntries([]);
    setStage('composing');
    
    setMessages(prev => {
      const newMsgs = [...prev, { id: msgIdRef.current++, role: 'user', content: userInput }];
      return newMsgs.slice(-MAX_MESSAGES);
    });
    
    try {
      // Use processQuery which orchestrates the multi-agent workflow
      await processQuery(userInput, (output) => {
        // This callback receives agent output during streaming
        if (typeof output === 'string') {
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
              // Add new assistant message
              return [...prev, { id: msgIdRef.current++, role: 'assistant', content: output }];
            } else {
              // Update existing assistant message
              return [...prev.slice(0, -1), { ...lastMsg, content: output }];
            }
          });
        }
      });
      
      // Log cache statistics after response
      console.error(formatStatsReport());
      resetResponseStats();
      
    } catch (err) {
      setMessages(prev => {
        const newMsgs = [...prev, { id: msgIdRef.current++, role: 'error', content: err.message }];
        return newMsgs.slice(-MAX_MESSAGES);
      });
    } finally {
      setIsLoading(false);
      setStage('idle');
    }
  }, [input, isLoading, processQuery]);

  const getStageText = () => {
    switch (stage) {
      case 'composing': return 'composing prompt...';
      case 'researching': return 'researching...';
      default: return 'thinking...';
    }
  };

  return (
    <Box flexDirection="column" height={40}>
      <Box marginBottom={1}>
        <Text bold magenta>EVPAgent</Text>
      </Box>
      
      <Box flexDirection="column" overflowY={true} height={35}>
        <Static items={messages}>
          {(msg) => (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color={msg.role === 'user' ? 'cyan' : 'green'}>
                {msg.role === 'user' ? 'User' : 'Agent'}
              </Text>
              <Text>{msg.content}</Text>
            </Box>
          )}
        </Static>
        
        {isLoading && (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <LoadingSpinner />
              <Text dimColor> </Text>
              <Text yellow>{getStageText()}</Text>
            </Box>
          </Box>
        )}
      </Box>
      
      <Box>
        <Text bold cyan>User</Text>
        <Text cyan> ➤ </Text>
        <Text>{input}</Text>
        <Text dimColor>_</Text>
      </Box>
    </Box>
  );
};

export default App;