import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth0 } from 'react-native-auth0';
import { supabase } from './supabaseClient';

interface CIBARequest {
  id: string;
  auth_req_id: string;
  binding_message: string;
  scope: string;
  created_at: string;
  expires_at: string;
}

export const ApprovalScreen = () => {
  const { user, getCredentials } = useAuth0();
  const [requests, setRequests] = useState<CIBARequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadPendingRequests();

    const interval = setInterval(loadPendingRequests, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadPendingRequests = async () => {
    if (!user?.sub) return;

    try {
      const credentials = await getCredentials();
      if (!credentials?.accessToken) return;

      const response = await fetch(
        'https://xhnfkgjetwmezaywydzm.supabase.co/functions/v1/get-pending-requests',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.requests) {
        setRequests(data.requests);
      }
    } catch (error) {
      console.error('Error loading pending requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproval = async (authReqId: string, action: 'approved' | 'denied') => {
    setProcessingId(authReqId);

    try {
      const credentials = await getCredentials();
      if (!credentials?.accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(
        'https://xhnfkgjetwmezaywydzm.supabase.co/functions/v1/ciba-approve',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authReqId,
            action,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setRequests(prev => prev.filter(req => req.auth_req_id !== authReqId));
        Alert.alert(
          'Success',
          action === 'approved'
            ? 'Authorization approved. The AI can now access your information.'
            : 'Authorization denied.'
        );
      } else {
        throw new Error(data.error || 'Failed to process approval');
      }
    } catch (error) {
      console.error('Error processing approval:', error);
      Alert.alert('Error', 'Failed to process approval. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs <= 0) return 'Expired';

    const minutes = Math.floor(diffSecs / 60);
    const seconds = diffSecs % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading pending requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Authorization Requests</Text>
        <Text style={styles.subHeaderText}>
          Approve or deny AI access to your information
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {requests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>No pending requests</Text>
            <Text style={styles.emptySubText}>
              When the AI needs access to your personal information, you'll see approval requests
              here.
            </Text>
          </View>
        ) : (
          requests.map(request => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <Text style={styles.requestTitle}>AI Information Request</Text>
                <Text style={styles.timeRemaining}>{getTimeRemaining(request.expires_at)}</Text>
              </View>

              <View style={styles.messageContainer}>
                <Text style={styles.messageLabel}>Request Details:</Text>
                <Text style={styles.messageText}>{request.binding_message}</Text>
              </View>

              <View style={styles.scopeContainer}>
                <Text style={styles.scopeLabel}>Requested Access:</Text>
                <Text style={styles.scopeText}>{request.scope}</Text>
              </View>

              <Text style={styles.timestamp}>Requested at {formatTime(request.created_at)}</Text>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.denyButton,
                    processingId === request.auth_req_id && styles.buttonDisabled,
                  ]}
                  onPress={() => handleApproval(request.auth_req_id, 'denied')}
                  disabled={processingId === request.auth_req_id}
                >
                  {processingId === request.auth_req_id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.buttonText}>Deny</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.approveButton,
                    processingId === request.auth_req_id && styles.buttonDisabled,
                  ]}
                  onPress={() => handleApproval(request.auth_req_id, 'approved')}
                  disabled={processingId === request.auth_req_id}
                >
                  {processingId === request.auth_req_id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.buttonText}>Approve</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    color: '#34C759',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  requestCard: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  timeRemaining: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
  },
  messageContainer: {
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  scopeContainer: {
    marginBottom: 12,
  },
  scopeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  scopeText: {
    fontSize: 14,
    color: '#007AFF',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  approveButton: {
    backgroundColor: '#34C759',
  },
  denyButton: {
    backgroundColor: '#FF3B30',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
