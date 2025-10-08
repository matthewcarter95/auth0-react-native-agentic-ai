import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth0 } from 'react-native-auth0';
import { supabase } from './supabaseClient';
import config from './auth0-configuration';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requires_approval?: boolean;
}

export const ChatScreen = () => {
  const { user, getCredentials } = useAuth0();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pollingAuthReqId, setPollingAuthReqId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadChatHistory();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const loadChatHistory = async () => {
    if (!user?.sub) return;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.sub)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.log('Error loading chat history:', error);
        return;
      }

      if (data) {
        setMessages(data);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText.trim();
    setInputText('');
    setIsLoading(true);

    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: userMessage },
    ]);

    try {
      const credentials = await getCredentials();
      if (!credentials?.accessToken) {
        throw new Error('No access token available');
      }

      const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhobmZrZ2pldHdtZXpheXd5ZHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTM5MzMsImV4cCI6MjA3NTQyOTkzM30.Go5P6t2CJ8NSrLBxzlvVxY3NHIKNTZSKOau10V6dLqA';

      const response = await fetch(
        'https://xhnfkgjetwmezaywydzm.supabase.co/functions/v1/ai-chat',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            auth0AccessToken: credentials.accessToken,
            auth0Domain: config.domain,
          }),
        }
      );

      const data = await response.json();

      if (data.requiresApproval) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.response,
            requires_approval: true,
          },
        ]);

        setPollingAuthReqId(data.authReqId);
        startPolling(data.authReqId, credentials.accessToken);
      } else {
        setMessages(prev => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', content: data.response },
        ]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = async (authReqId: string, accessToken: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const pollCIBA = async () => {
      try {
        const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhobmZrZ2pldHdtZXpheXd5ZHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTM5MzMsImV4cCI6MjA3NTQyOTkzM30.Go5P6t2CJ8NSrLBxzlvVxY3NHIKNTZSKOau10V6dLqA';

        const response = await fetch(
          'https://xhnfkgjetwmezaywydzm.supabase.co/functions/v1/ciba-poll',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              authReqId,
              auth0AccessToken: accessToken,
              auth0Domain: config.domain,
            }),
          }
        );

        const data = await response.json();

        if (data.status === 'approved') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setMessages(prev => [
            ...prev,
            { id: Date.now().toString(), role: 'assistant', content: data.response },
          ]);

          setPollingAuthReqId(null);
        } else if (data.status === 'denied' || data.status === 'expired') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content:
                data.status === 'denied'
                  ? 'You denied access to your personal information.'
                  : 'The authorization request expired.',
            },
          ]);

          setPollingAuthReqId(null);
        }
      } catch (error) {
        console.error('Error polling CIBA:', error);
      }
    };

    pollCIBA();
    pollingIntervalRef.current = setInterval(pollCIBA, 3000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>AI Chat Assistant</Text>
        <Text style={styles.subHeaderText}>Ask me about yourself</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(message => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.role === 'user' ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            <Text
              style={
                message.role === 'user' ? styles.userMessageText : styles.assistantMessageText
              }
            >
              {message.content}
            </Text>
            {message.requires_approval && (
              <Text style={styles.approvalText}>⏳ Awaiting approval...</Text>
            )}
          </View>
        ))}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your profile..."
          placeholderTextColor="#999"
          multiline
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      {pollingAuthReqId && (
        <View style={styles.pollingBanner}>
          <ActivityIndicator size="small" color="#FFF" />
          <Text style={styles.pollingText}>
            Waiting for authorization approval...
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  subHeaderText: {
    fontSize: 14,
    color: '#E0E0E0',
    marginTop: 4,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  userMessageText: {
    color: '#FFF',
    fontSize: 16,
  },
  assistantMessageText: {
    color: '#000',
    fontSize: 16,
  },
  approvalText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    padding: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  pollingBanner: {
    backgroundColor: '#FF9500',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollingText: {
    color: '#FFF',
    marginLeft: 8,
    fontWeight: '600',
  },
});
