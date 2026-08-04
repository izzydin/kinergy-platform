import React from 'react';
import { BrowserRouter } from 'react-router-dom';

interface RouterProviderProps {
  children: React.ReactNode;
}

export const RouterProvider: React.FC<RouterProviderProps> = ({ children }) => {
  return <BrowserRouter>{children}</BrowserRouter>;
};
