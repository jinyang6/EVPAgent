import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Box, Text, useInput, Static } from 'ink';
import { formatStatsReport, resetResponseStats } from '../../agent/tools/stats.mjs';

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

const App = ({ agent, config }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolQuery, setToolQuery] = useState(null);
  const [toolEntries, setToolEntries] = useState([]);
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
    
    setMessages(prev => {
      const newMsgs = [...prev, { id: msgIdRef.current++, role: 'user', content: userInput }];
      return newMsgs.slice(-MAX_MESSAGES);
    });
    
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const initialState = {
        messages: [...history, { role: 'user', content: userInput }]
      };
      
      const stream = await agent.stream(initialState, config);
      let finalResponse = '';
      
      for await (const chunk of stream) {
        if (chunk.agent?.messages) {
          const newestMsg = chunk.agent.messages[chunk.agent.messages.length - 1];
          
          if (newestMsg._getType() === 'ai' || newestMsg.type === 'ai') {
            // Show tool query
            if (newestMsg.tool_calls?.length > 0) {
              const toolCall = newestMsg.tool_calls[0];
              const args = toolCall.function?.arguments || '{}';
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(args);
              } catch {
                parsedArgs = { raw: args };
              }
              setToolQuery({ name: toolCall.name, args: parsedArgs });
            }
            if (newestMsg.content) {
              finalResponse = newestMsg.content;
            }
          }
        }
        
        // Show tool entries/result (first 5 lines)
        if (chunk.tools?.messages) {
          const toolMsg = chunk.tools.messages[0];
          if (toolMsg.content) {
            const lines = [];
            let start = 0;
            for (let i = 0; i < 5; i++) {
              const nlIndex = toolMsg.content.indexOf('\n', start);
              if (nlIndex === -1) {
                lines.push(toolMsg.content.slice(start, start + 200));
                break;
              }
              lines.push(toolMsg.content.slice(start, nlIndex));
              start = nlIndex + 1;
            }
            setToolEntries(lines.map(l => ({ text: l })));
          }
        }
      }
      
      if (finalResponse) {
        setMessages(prev => {
          const newMsgs = [...prev, { id: msgIdRef.current++, role: 'assistant', content: finalResponse }];
          return newMsgs.slice(-MAX_MESSAGES);
        });
      }
      
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
    }
  }, [input, isLoading, messages, agent, config]);

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
              {toolQuery ? (
                <Text yellow>{toolQuery.name}({Object.entries(toolQuery.args).map(([k,v]) => `${k}=${v}`).join(', ')})</Text>
              ) : (
                <Text dimColor>thinking...</Text>
              )}
            </Box>
            {toolEntries.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {toolEntries.slice(0, 5).map((entry, i) => (
                  <Text key={i} dimColor>
                    {entry.title ? `[${entry.title}]` : entry.text?.slice(0, 80) || ''}
                  </Text>
                ))}
                {toolEntries.length > 5 && (
                  <Text dimColor>... and {toolEntries.length - 5} more</Text>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
      
      <Box>
        <Text cyan>➤ </Text>
        <Text>{input}</Text>
        <Text dimColor>_</Text>
      </Box>
    </Box>
  );
};

export default App;