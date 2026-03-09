import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test, vi } from 'vitest';
import RegisterForm from '../components/RegisterForm';

describe('RegisterForm', () => {
  test('shows validation error when username is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<RegisterForm loading={false} error={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/please enter a username/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('submits username and password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<RegisterForm loading={false} error={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i), '  pablo  ');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /register/i }));

    expect(onSubmit).toHaveBeenCalledWith({ username: 'pablo', password: 'secret' });
  });
});
