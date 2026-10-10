import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { socketService } from '../src/services/OnlineService';
import { useGameStore, PEN_CATALOG } from '../src/store/gameStore';
import { generateObstacles } from '../src/utils/deskGenerator';

export default function OnlineLobby() {
  const router = useRouter();
  const { setGameMode, playerPen, setOnlineObstacles, setPlayerPen, setAiPen } = useGameStore();
  
  const [status, setStatus] = useState<'idle' | 'creating' | 'waiting' | 'joining'>('idle');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentPenIndex = PEN_CATALOG.findIndex(p => p.id === playerPen.id);

  const handleNextPen = () => {
    const nextIndex = (currentPenIndex + 1) % PEN_CATALOG.length;
    setPlayerPen(PEN_CATALOG[nextIndex]);
  };

  const handlePrevPen = () => {
    const prevIndex = (currentPenIndex - 1 + PEN_CATALOG.length) % PEN_CATALOG.length;
    setPlayerPen(PEN_CATALOG[prevIndex]);
  };

  useEffect(() => {
    // Ensure we connect when entering this screen
    const socket = socketService.connect();

    // Event Listeners
    socket.on('room_created', (data: { room_code: string }) => {
      setCreatedRoomCode(data.room_code);
      socketService.roomCode = data.room_code;
      setStatus('waiting');
    });

    socket.on('error', (data: { message: string }) => {
      setErrorMsg(data.message);
      setStatus('idle');
    });

    socket.on('game_start', (data) => {
      console.log('Game starting! Setting up synced environment...');
      
      // Update global app state to online mode
      setGameMode('online-multiplayer' as any); 
      
      // Apply synced network environment to local store
      if (data.obstacles) setOnlineObstacles(data.obstacles);
      if (data.host_pen) setPlayerPen(data.host_pen);
      if (data.guest_pen) setAiPen(data.guest_pen);
      
      // Navigate to the game screen
      router.push('/game');
    });

    // Cleanup listeners when component unmounts
    return () => {
      socket.off('room_created');
      socket.off('error');
      socket.off('game_start');
    };
  }, []);

  const handleCreateRoom = () => {
    setStatus('creating');
    setErrorMsg('');
    const syncedObstacles = generateObstacles();
    socketService.createRoom(syncedObstacles, playerPen);
  };

  const handleJoinRoom = () => {
    if (joinCodeInput.length !== 6) {
      setErrorMsg('Room code must be 6 characters');
      return;
    }
    setStatus('joining');
    setErrorMsg('');
    socketService.joinRoom(joinCodeInput.toUpperCase(), playerPen);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ONLINE DESK ROYALE</Text>
      
      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      {status === 'idle' && (
        <View style={styles.actionContainer}>
          {/* Pen Selector Widget */}
          <View style={styles.penSelectorContainer}>
            <Text style={styles.penSelectorTitle}>CHOOSE YOUR PEN</Text>
            <View style={styles.penSelectorRow}>
              <TouchableOpacity onPress={handlePrevPen} style={styles.arrowBtn}>
                <Ionicons name="chevron-back" size={28} color="#F8FAFC" />
              </TouchableOpacity>
              
              <View style={styles.penPreviewBox}>
                <View style={[styles.penIcon, { backgroundColor: playerPen.color }]}>
                  <View style={[styles.penTips, { backgroundColor: playerPen.secondaryColor }]} />
                </View>
                <Text style={styles.penNameText}>{playerPen.name}</Text>
                <Text style={styles.penClassText}>{playerPen.class}</Text>
              </View>

              <TouchableOpacity onPress={handleNextPen} style={styles.arrowBtn}>
                <Ionicons name="chevron-forward" size={28} color="#F8FAFC" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateRoom}>
            <Text style={styles.btnText}>HOST A GAME</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.joinContainer}>
            <TextInput
              style={styles.input}
              placeholder="ENTER 6-DIGIT CODE"
              placeholderTextColor="#888"
              value={joinCodeInput}
              onChangeText={setJoinCodeInput}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleJoinRoom}>
              <Text style={styles.btnText}>JOIN GAME</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(status === 'creating' || status === 'joining') && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADE80" />
          <Text style={styles.loadingText}>
            {status === 'creating' ? 'Creating lobby...' : 'Joining lobby...'}
          </Text>
        </View>
      )}

      {status === 'waiting' && createdRoomCode && (
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingTitle}>LOBBY CREATED</Text>
          <Text style={styles.waitingSub}>Share this code with your opponent:</Text>
          
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{createdRoomCode}</Text>
          </View>

          <ActivityIndicator size="small" color="#4ADE80" style={{marginTop: 20}} />
          <Text style={styles.waitingText}>Waiting for opponent to connect...</Text>
          
          <TouchableOpacity 
            style={[styles.secondaryBtn, {marginTop: 40}]} 
            onPress={() => setStatus('idle')}
          >
            <Text style={styles.btnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity 
        style={styles.backBtn}
        onPress={() => {
          if (status === 'waiting') {
            // Leave room essentially (for future implementation)
          }
          router.back();
        }}
      >
        <Text style={styles.backBtnText}>← Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    marginBottom: 40,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  actionContainer: {
    width: '100%',
    maxWidth: 340,
  },
  primaryBtn: {
    backgroundColor: '#4ADE80',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtn: {
    backgroundColor: '#3B82F6',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  btnText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748B',
    paddingHorizontal: 15,
    fontWeight: '700',
  },
  joinContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#334155',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
  },
  waitingContainer: {
    alignItems: 'center',
    width: '100%',
  },
  waitingTitle: {
    color: '#4ADE80',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  waitingSub: {
    color: '#94A3B8',
    marginBottom: 20,
  },
  codeBox: {
    backgroundColor: '#1E293B',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4ADE80',
  },
  codeText: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 8,
  },
  waitingText: {
    color: '#94A3B8',
    marginTop: 10,
    fontStyle: 'italic',
  },
  errorText: {
    color: '#EF4444',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  backBtn: {
    position: 'absolute',
    bottom: 40,
  },
  backBtnText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  penSelectorContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 15,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  penSelectorTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
  },
  penSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  arrowBtn: {
    padding: 10,
  },
  penPreviewBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  penIcon: {
    width: 100,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  penTips: {
    width: 20,
    height: '100%',
  },
  penNameText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  penClassText: {
    color: '#64748B',
    fontSize: 12,
    textTransform: 'uppercase',
  },
});
