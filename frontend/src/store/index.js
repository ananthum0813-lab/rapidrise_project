import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import filesReducer from './filesSlice'
import sharingReducer from './sharingSlice'
import foldersReducer from './foldersSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    files: filesReducer,
    sharing: sharingReducer,
    folders: foldersReducer,  
  },
})