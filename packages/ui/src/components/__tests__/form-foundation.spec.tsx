import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  FormControl,
  FormErrorMessage,
  FormField,
  FormHelperText,
  FormLabel,
  Input,
  PasswordInput,
} from '../index';

describe('Form Foundation Components (@kinergy-platform/ui)', () => {
  describe('PasswordInput Primitive', () => {
    it('renders password input and toggles visibility on trigger click', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<PasswordInput ref={ref} placeholder="Enter password" />);

      const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.type).toBe('password');
      expect(ref.current).toBe(input);

      const toggleButton = screen.getByRole('button', { name: /show password/i });
      expect(toggleButton).toBeInTheDocument();

      fireEvent.click(toggleButton);
      expect(input.type).toBe('text');
      expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

      fireEvent.click(toggleButton);
      expect(input.type).toBe('password');
    });

    it('disables input and toggle button when disabled prop is true', () => {
      render(<PasswordInput disabled placeholder="Disabled password" />);

      const input = screen.getByPlaceholderText('Disabled password');
      const toggleButton = screen.getByRole('button', { name: /show password/i });

      expect(input).toBeDisabled();
      expect(toggleButton).toBeDisabled();
    });
  });

  describe('FormField Composition & Validation Visuals', () => {
    it('links label, control, helper text, and error message accessibility IDs automatically', () => {
      render(
        <FormField controlId="email-control" isInvalid>
          <FormLabel required>Email Address</FormLabel>
          <FormControl>
            <Input placeholder="user@example.com" />
          </FormControl>
          <FormHelperText>We will send account recovery emails here.</FormHelperText>
          <FormErrorMessage>Invalid email address format.</FormErrorMessage>
        </FormField>,
      );

      const label = screen.getByText('Email Address');
      expect(label).toHaveAttribute('for', 'email-control');

      const input = screen.getByPlaceholderText('user@example.com');
      expect(input).toHaveAttribute('id', 'email-control');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'email-control-helper email-control-error');

      const error = screen.getByRole('alert');
      expect(error).toBeInTheDocument();
      expect(error).toHaveTextContent('Invalid email address format.');
    });

    it('supports React Hook Form compatibility by passing register props', () => {
      const handleBlur = jest.fn();
      const handleChange = jest.fn();

      render(
        <FormField controlId="username">
          <FormLabel>Username</FormLabel>
          <FormControl>
            <Input name="username" onBlur={handleBlur} onChange={handleChange} />
          </FormControl>
        </FormField>,
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('name', 'username');

      fireEvent.change(input, { target: { value: 'johndoe' } });
      expect(handleChange).toHaveBeenCalled();

      fireEvent.blur(input);
      expect(handleBlur).toHaveBeenCalled();
    });
  });
});
