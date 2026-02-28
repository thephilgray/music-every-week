import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 font-sans">
      <div className="max-w-3xl mx-auto bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
        <div className="mb-8">
          <Link to="/login" className="inline-flex items-center text-blue-400 hover:text-blue-300 transition gap-2 text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
        
        <h1 className="text-3xl font-bold mb-6 text-white">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              Welcome to Music Every Week ("MEW", "we", "our", or "us"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy will inform you as to how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Data We Collect</h2>
            <p className="mb-2">We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier (alias), and profile picture.</li>
              <li><strong>Contact Data:</strong> includes email address.</li>
              <li><strong>Technical Data:</strong> includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, and other technology on the devices you use to access this website.</li>
              <li><strong>Profile Data:</strong> includes your interests, preferences, feedback, uploaded tracks, lyrics, and comments.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Data</h2>
            <p className="mb-2">We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>To register you as a new user and manage your account.</li>
              <li>To provide the core functionality of the app, including uploading tracks, creating playlists, and facilitating community feedback.</li>
              <li>To manage our relationship with you, including notifying you about changes to our terms or privacy policy.</li>
              <li>To administer and protect our business and this website.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Services</h2>
            <p>
              We use third-party services to facilitate our application, including Firebase (Authentication, Firestore Database) and Cloudflare R2 (for file storage). These services may collect and process your data according to their own privacy policies. We use Google Sign-in as an authentication provider, which shares your email, name, and profile picture with us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Security</h2>
            <p>
              We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used, or accessed in an unauthorized way, altered, or disclosed. Access to your personal data is limited to those employees, agents, contractors, and other third parties who have a business need to know.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or our privacy practices, please contact us at: <a href="mailto:MEWisMusicEveryWeek@gmail.com" className="text-blue-400 hover:underline">MEWisMusicEveryWeek@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
