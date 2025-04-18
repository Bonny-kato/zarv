import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Project, Schema, SchemaVersion, User, projectOperations, projectUserOperations, schemaOperations, userOperations } from '../utils/db';
import SchemaEditor from '../components/SchemaEditor';
import SchemaActions from '../components/SchemaActions';
import SampleDataGenerator from '../components/SampleDataGenerator';
import { testSchema, SchemaTestResult } from '../utils/schemaTestService';

const SchemaDetailPage: React.FC = () => {
  const { projectId, schemaId } = useParams<{ projectId: string; schemaId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<SchemaTestResult | null>(null);
  const [isTestingSchema, setIsTestingSchema] = useState(false);
  const [creator, setCreator] = useState<User | null>(null);
  const [schemaVersions, setSchemaVersions] = useState<SchemaVersion[]>([]);
  const [versionUsers, setVersionUsers] = useState<Record<number, User>>({});
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<SchemaVersion | null>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Load project and schema on component mount
  useEffect(() => {
    const loadData = async () => {
      if (!projectId || !schemaId || !currentUser?.id) {
        setIsLoading(false);
        return;
      }

      try {
        // Load project
        const projectData = await projectOperations.getById(parseInt(projectId));

        if (!projectData) {
          setError('Project not found');
          setIsLoading(false);
          return;
        }

        // Verify that the user has access to the project
        const hasAccess = await projectUserOperations.isUserInProject(parseInt(projectId), currentUser.id);
        if (!hasAccess) {
          setError('You do not have permission to access this project');
          setIsLoading(false);
          return;
        }

        setProject(projectData);

        // Load schema
        const schemaData = await schemaOperations.getById(parseInt(schemaId));

        if (!schemaData) {
          setError('Schema not found');
          setIsLoading(false);
          return;
        }

        // Verify that the schema belongs to the current project
        if (schemaData.projectId !== parseInt(projectId)) {
          setError('Schema does not belong to this project');
          setIsLoading(false);
          return;
        }

        setSchema(schemaData);

        // Load schema creator
        const creatorData = await schemaOperations.getCreator(parseInt(schemaId));
        setCreator(creatorData || null);

        // Load schema versions
        const versionsData = await schemaOperations.getVersions(parseInt(schemaId));
        setSchemaVersions(versionsData);

        // Load user information for each version
        const users: Record<number, User> = {};
        for (const version of versionsData) {
          if (version.userId && !users[version.userId]) {
            try {
              const userData = await userOperations.getById(version.userId);
              if (userData) {
                users[version.userId] = userData;
              }
            } catch (error) {
              console.error(`Error loading user data for version ${version.id}:`, error);
            }
          }
        }
        setVersionUsers(users);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [projectId, schemaId, currentUser]);

  const handleDeleteSchema = async () => {
    if (!schema?.id) {
      setError('Schema not found');
      return;
    }

    if (!currentUser?.id) {
      setError('You must be logged in to delete a schema');
      return;
    }

    if (!confirm('Are you sure you want to delete this schema? This action cannot be undone.')) {
      return;
    }

    try {
      // Pass the current user ID to record the deletion in version history
      await schemaOperations.delete(schema.id, currentUser.id);
      // Navigate back to project details
      navigate(`/projects/${projectId}`);
    } catch (err) {
      console.error('Error deleting schema:', err);
      setError('Failed to delete schema');
    }
  };

  const handleDuplicateSchema = async () => {
    if (!schema || !projectId) {
      setError('Schema not found');
      return;
    }

    if (!currentUser?.id) {
      setError('You must be logged in to duplicate a schema');
      return;
    }

    try {
      // Create a new schema with the same definition but a different name
      const duplicateName = `${schema.name} (Copy)`;
      const newSchemaId = await schemaOperations.create(
        parseInt(projectId),
        duplicateName,
        schema.schemaDefinition,
        schema.description,
        schema.endpointUrl,
        currentUser.id // Pass the current user ID as the creator
      );

      // Navigate to the new schema
      navigate(`/projects/${projectId}/schemas/${newSchemaId}`);
    } catch (err) {
      console.error('Error duplicating schema:', err);
      setError('Failed to duplicate schema');
    }
  };

  const handleTestSchema = async () => {
    if (!schema?.endpointUrl) {
      setTestResult({
        success: false,
        message: 'No endpoint URL specified for this schema'
      });
      return;
    }

    setIsTestingSchema(true);
    setTestResult(null);

    try {
      // Use the schema testing service to test the schema
      const result = await testSchema(
        schema.schemaDefinition,
        schema.endpointUrl,
        'GET', // Default to GET method
        {}, // No headers by default
        undefined, // No request body for GET
        '3.24.2' // Use the latest Zod version
      );

      setTestResult(result);
    } catch (err) {
      console.error('Error testing schema:', err);
      setTestResult({
        success: false,
        message: `Error testing schema: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsTestingSchema(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">Loading schema details...</p>
        </div>
      </Layout>
    );
  }

  if (error && !schema) {
    return (
      <Layout>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <div className="mt-4">
          <Link
            to={`/projects/${projectId}`}
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Back to Project
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="mb-6">
          <Link
            to={`/projects/${projectId}`}
            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Project
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {schema && (
          <>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden mb-8">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {schema.name}
                    </h1>
                    {schema.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {schema.description}
                      </p>
                    )}
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      <p>Created: {formatDate(schema.createdAt)}{creator && ` by ${creator.name}`}</p>
                      <p>Last updated: {formatDate(schema.updatedAt)}</p>
                      {schemaVersions.length > 0 && (
                        <button
                          onClick={() => setShowVersionHistory(!showVersionHistory)}
                          className="mt-2 text-indigo-600 dark:text-indigo-400 hover:underline flex items-center text-sm"
                        >
                          {showVersionHistory ? 'Hide Version History' : `View Version History (${schemaVersions.length})`}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Link
                      to={`/projects/${projectId}/schemas/${schemaId}/edit`}
                      className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={handleDeleteSchema}
                      className="px-3 py-1 border border-red-300 dark:border-red-600 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {schema.endpointUrl && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Endpoint URL
                    </h3>
                    <p className="text-gray-900 dark:text-white font-mono break-all">
                      {schema.endpointUrl}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Schema Definition
                    </h3>
                    <SchemaEditor
                      value={schema.schemaDefinition}
                      readOnly={true}
                      height="350px"
                    />
                    <div className="mt-2">
                      <SchemaActions
                        schemaDefinition={schema.schemaDefinition}
                        schemaName={schema.name}
                        onDuplicate={handleDuplicateSchema}
                        onRunSchema={schema.endpointUrl ? handleTestSchema : undefined}
                        readOnly={true}
                      />
                      {!schema.endpointUrl && (
                        <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                          Add an endpoint URL to enable schema testing
                        </p>
                      )}
                      {isTestingSchema && (
                        <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                          Testing schema...
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <SampleDataGenerator
                      schemaDefinition={schema.schemaDefinition}
                      schemaName={schema.name}
                      autoGenerate={true}
                    />
                  </div>
                </div>

                {/* Schema Version History */}
                {showVersionHistory && schemaVersions.length > 0 && (
                  <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                      Version History
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <div className="space-y-3">
                        {schemaVersions.map((version, index) => (
                          <div
                            key={version.id}
                            className={`p-3 rounded-md cursor-pointer transition-colors ${
                              selectedVersion?.id === version.id 
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800' 
                                : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700'
                            }`}
                            onClick={() => setSelectedVersion(selectedVersion?.id === version.id ? null : version)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {version.changeDescription || (index === schemaVersions.length - 1 ? 'Initial version' : 'Updated schema')}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {new Date(version.timestamp).toLocaleString()}
                                  {version.userId && (
                                    version.userId === currentUser?.id
                                      ? " by me"
                                      : versionUsers[version.userId]
                                        ? ` by ${versionUsers[version.userId].name}`
                                        : ""
                                  )}
                                </p>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {index === 0 ? 'Latest' : `v${schemaVersions.length - index}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedVersion && (
                      <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-md font-medium text-gray-900 dark:text-white">
                            Schema Snapshot
                          </h4>
                          <button
                            onClick={() => setSelectedVersion(null)}
                            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mb-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Name: {selectedVersion.name}</p>
                          {selectedVersion.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Description: {selectedVersion.description}
                            </p>
                          )}
                          {selectedVersion.endpointUrl && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Endpoint URL: {selectedVersion.endpointUrl}
                            </p>
                          )}
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Updated: {new Date(selectedVersion.timestamp).toLocaleString()}
                            {selectedVersion.userId && (
                              selectedVersion.userId === currentUser?.id
                                ? " by me"
                                : versionUsers[selectedVersion.userId]
                                  ? ` by ${versionUsers[selectedVersion.userId].name}`
                                  : ""
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Schema Definition:</p>
                          <SchemaEditor
                            value={selectedVersion.schemaDefinition}
                            readOnly={true}
                            height="200px"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {testResult && (
                  <div className={`mt-4 p-4 rounded-md ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                    <div className="flex items-center mb-2">
                      {testResult.success ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="font-medium">{testResult.message}</span>
                    </div>

                    {testResult.responseStatus && (
                      <div className="text-sm mt-2">
                        <p><span className="font-semibold">Status:</span> {testResult.responseStatus} {testResult.responseStatusText}</p>
                      </div>
                    )}

                    {testResult.validationResult && !testResult.validationResult.isValid && testResult.validationResult.errors.length > 0 && (
                      <div className="mt-3">
                        <h4 className="font-semibold mb-1">Validation Errors:</h4>
                        <ul className="list-disc pl-5 space-y-1 text-sm">
                          {testResult.validationResult.errors.map((error, index) => (
                            <li key={index}>
                              <span className="font-medium">{error.path.length > 0 ? error.path.join('.') : 'root'}:</span> {error.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {testResult.data && (
                      <div className="mt-3">
                        <details className="text-sm">
                          <summary className="font-semibold cursor-pointer">Response Data</summary>
                          <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-auto text-xs max-h-40">
                            {JSON.stringify(testResult.data, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default SchemaDetailPage;
