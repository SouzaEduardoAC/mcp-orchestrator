import { DockerClient } from '../../../src/infrastructure/docker/DockerClient';
import Docker from 'dockerode';

// Mock Dockerode
jest.mock('dockerode');

describe('DockerClient', () => {
    let dockerClient: DockerClient;
    let mockCreateContainer: jest.Mock;
    let mockStart: jest.Mock;

    beforeEach(() => {
        // Reset mocks
        mockCreateContainer = jest.fn().mockResolvedValue({
            start: jest.fn().mockResolvedValue(undefined),
            id: 'test-container-id'
        });
        mockStart = jest.fn();

        (Docker as unknown as jest.Mock).mockImplementation(() => ({
            createContainer: mockCreateContainer,
            pull: jest.fn(), // Helper
            getContainer: jest.fn()
        }));

        dockerClient = new DockerClient();
    });

    it('should spawn container with security limits', async () => {
        await dockerClient.spawnContainer('alpine:latest', {});

        expect(mockCreateContainer).toHaveBeenCalledWith(expect.objectContaining({
            HostConfig: expect.objectContaining({
                Memory: 512 * 1024 * 1024,
                NanoCpus: 500000000,
                NetworkMode: 'none'
            })
        }));
    });
});
