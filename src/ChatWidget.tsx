import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db, auth } from './firebase';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const user = auth.currentUser;

  useEffect(() => {
    if (!isOpen || !user) return;
    
    const q = query(collection(db, `chats/${user.uid}/messages`), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [isOpen, user]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    // Ensure parent document exists
    await setDoc(doc(db, `chats`, user.uid), {
      lastMessage: newMessage,
      lastUpdated: serverTimestamp(),
      userName: user.displayName || user.email || 'Anonymous',
      userEmail: user.email || '',
      unreadCount: 1 // For admin to see
    }, { merge: true });

    await addDoc(collection(db, `chats/${user.uid}/messages`), {
      text: newMessage,
      sender: user.uid,
      timestamp: serverTimestamp()
    });
    setNewMessage('');
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[100]">
      {isOpen ? (
        <div className="bg-[#141823] border border-white/10 rounded-2xl w-[320px] h-[400px] flex flex-col shadow-2xl overflow-hidden">
          <div className="bg-gold text-black p-4 flex justify-between items-center font-bold">
            <span>STEA Live Support</span>
            <button onClick={() => setIsOpen(false)}><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`max-w-[80%] p-3 rounded-xl ${msg.sender === user.uid ? 'bg-gold/20 text-white ml-auto rounded-br-sm' : 'bg-white/10 text-white mr-auto rounded-bl-sm'}`}>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-3 border-t border-white/10 flex gap-2">
            <input 
              type="text" 
              value={newMessage} 
              onChange={e => setNewMessage(e.target.value)} 
              placeholder="Type a message..." 
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
            />
            <button type="submit" className="bg-gold text-black p-2 rounded-lg"><Send size={18} /></button>
          </form>
        </div>
      ) : (
        <button onClick={() => setIsOpen(true)} className="bg-gold text-black p-4 rounded-full shadow-[0_8px_24px_rgba(245,166,35,0.4)] hover:scale-110 transition-transform">
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
}
