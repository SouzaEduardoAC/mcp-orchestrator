"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DockerClient_1 = require("../../../src/infrastructure/docker/DockerClient");
const dockerode_1 = __importDefault(require("dockerode"));
// Mock Dockerode
jest.mock('dockerode');
describe('DockerClient', () => {
    let dockerClient;
    let mockCreateContainer;
    let mockStart;
    beforeEach(() => {
        // Reset mocks
        mockCreateContainer = jest.fn().mockResolvedValue({
            start: jest.fn().mockResolvedValue(undefined),
            id: 'test-container-id'
        });
        mockStart = jest.fn();
        dockerode_1.default.mockImplementation(() => ({
            createContainer: mockCreateContainer,
            pull: jest.fn(), // Helper
            getContainer: jest.fn()
        }));
        dockerClient = new DockerClient_1.DockerClient();
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
