import { createContext, useContext } from 'react';
import { User } from '../types';

interface UserContextType {
  users: User[];
  currentUser: User | null;
  // We expose the high-level update function from App.tsx to maintain the Undo/Redo history chain
  updateUsers: (users: User[], skipHistory?: boolean) => void; 
}

export const UserContext = createContext<UserContextType | null>(null);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};