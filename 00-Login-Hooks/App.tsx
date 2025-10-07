import React from 'react';
import {Button, StyleSheet, Text, View, TouchableOpacity} from 'react-native';
import {useAuth0, Auth0Provider} from 'react-native-auth0';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import config from './auth0-configuration';
import {ChatScreen} from './ChatScreen';
import {ApprovalScreen} from './ApprovalScreen';

const Stack = createNativeStackNavigator();

const HomeScreen = ({navigation}: any) => {
  const {authorize, clearSession, user, error, isLoading} = useAuth0();

  const onLogin = async () => {
    await authorize({}, {});
  };

  const loggedIn = user !== undefined && user !== null;

  const onLogout = async () => {
    await clearSession({}, {});
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Auth0 AI Chat</Text>
      {user && <Text style={styles.userText}>Logged in as {user.name}</Text>}
      {!user && <Text style={styles.userText}>You are not logged in</Text>}

      {loggedIn ? (
        <>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Chat')}>
            <Text style={styles.buttonText}>Open AI Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Approvals')}
          >
            <Text style={styles.buttonText}>View Approval Requests</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Button onPress={onLogin} title="Log In with Auth0" />
      )}

      {error && <Text style={styles.error}>{error.message}</Text>}
    </View>
  );
};

const App = () => {
  return (
    <Auth0Provider domain={config.domain} clientId={config.clientId}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Approvals"
            component={ApprovalScreen}
            options={{headerShown: false}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Auth0Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  header: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#007AFF',
  },
  userText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#FFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButtonText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  error: {
    marginTop: 20,
    textAlign: 'center',
    color: '#FF3B30',
    fontSize: 14,
  },
});

export default App;