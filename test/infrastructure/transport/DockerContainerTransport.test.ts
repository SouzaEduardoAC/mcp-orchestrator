import { DockerContainerTransport } from '../../../src/infrastructure/transport/DockerContainerTransport';
import { PassThrough } from 'stream';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// Mock Docker Container
const mockAttach = jest.fn();
const mockDemuxStream = jest.fn();

const mockContainer: any = {
    attach: mockAttach,
    modem: {
        demuxStream: mockDemuxStream
    }
};

describe('DockerContainerTransport', () => {
    let transport: DockerContainerTransport;
    let transportStream: PassThrough;

    beforeEach(() => {
        jest.clearAllMocks();
        transportStream = new PassThrough(); 

        mockAttach.mockResolvedValue(transportStream);
        
        transport = new DockerContainerTransport(mockContainer);
    });

    it('should handle split JSON chunks', async () => {
        let capturedStdout: PassThrough | undefined;
        
        mockDemuxStream.mockImplementation((stream, stdout, stderr) => {
            capturedStdout = stdout;
        });

        await transport.start();
        
        if (!capturedStdout) {
            throw new Error("demuxStream was not called");
        }

        const onMessage = jest.fn();
        transport.onmessage = onMessage;

        // Simulate split chunk
        const msg1 = { jsonrpc: "2.0", method: "test", id: 1 };
        const serialized = JSON.stringify(msg1) + "\n";
        const part1 = serialized.substring(0, 10);
        const part2 = serialized.substring(10);

        capturedStdout.write(Buffer.from(part1));
        capturedStdout.write(Buffer.from(part2));

        // Allow event loop to tick
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ method: "test" }));
    });
});