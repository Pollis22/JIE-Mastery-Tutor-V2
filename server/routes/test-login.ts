import express from 'express';

const router = express.Router();

// Hardcoded test user - this will definitely work
const TEST_USER = {
  id: 1,
  email: 'test@example.com',
  username: 'test'
};

router.post('/test-login', express.json(), async (req, res) => {
  console.log('🧪 TEST LOGIN:', req.body);
  
  try {
    const { username, email, password } = req.body;
    const loginEmail = email || username;

    // Simple validation
    if (loginEmail === 'test@example.com' && password === 'TestPass123!') {
      return res.json({ 
        success: true, 
        user: { 
          id: 1, 
          email: 'test@example.com', 
          username: 'test' 
        } 
      });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
    
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(500).json({ 
      message: 'Error', 
      error: error.message,
      stack: error.stack 
    });
  }
});

export default router;
