import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 font-sans">
      <div className="max-w-3xl mx-auto bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
        <div className="mb-8">
          <Link to="/login" className="inline-flex items-center text-blue-400 hover:text-blue-300 transition gap-2 text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
        
        <h1 className="text-3xl font-bold mb-6 text-white">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Music Every Week ("MEW") application, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              MEW is an invite-only platform designed to facilitate weekly music collaboration, track uploading, and community feedback. We reserve the right to modify or discontinue, temporarily or permanently, the service with or without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. User Accounts and Content</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be invited to use this service.</li>
              <li>You are responsible for safeguarding the password or magic links that you use to access the service.</li>
              <li>You retain all of your ownership rights in your User Content (tracks, lyrics, comments). By submitting content to MEW, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, display, and distribute that content solely for the purpose of operating the MEW platform.</li>
              <li>You agree not to upload any content that infringes on the intellectual property rights of others, or is unlawful, offensive, or malicious.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Intellectual Property</h2>
            <p>
              The service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of MEW and its licensors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Termination</h2>
            <p>
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Limitation of Liability</h2>
            <p>
              In no event shall MEW, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at: <a href="mailto:MEWisMusicEveryWeek@gmail.com" className="text-blue-400 hover:underline">MEWisMusicEveryWeek@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
